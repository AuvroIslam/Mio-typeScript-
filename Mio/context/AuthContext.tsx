import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendEmailVerification,
  reload,
  sendPasswordResetEmail,
  signInWithCredential,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, functions } from '../config/firebaseConfig';
import { Loader } from '../components';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { initializePushNotifications } from '../utils/notificationHandler';
import { unregisterFromPushNotifications } from '../utils/registerForPushNotificationsAsync'; // Added import

interface User {
  uid: string;
  email: string | null;
  displayName?: string | null;
  hasProfile?: boolean;
  isAdmin?: boolean;
  emailVerified?: boolean;
  photoURL?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<boolean>;
  setUserHasProfile: (hasProfile: boolean) => void;
  sendVerification: () => Promise<void>;
  refreshUserState: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  checkAdminStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Function to update user state from Firebase user
  const updateUserState = useCallback(async (firebaseUser: any) => {
    if (firebaseUser) {
      // Check if user has profile data
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userRef);
      const hasProfile = userDoc.exists() && userDoc.data().profileCompleted;
      
      // Get custom claims to check admin status
      const token = await firebaseUser.getIdTokenResult();
      const isAdmin = token.claims?.admin === true;

      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        hasProfile,
        isAdmin,
        emailVerified: firebaseUser.emailVerified,
        photoURL: firebaseUser.photoURL
      });
    } else {
      setUser(null);
    }
  }, []);

  // Manually refresh the user state
  const refreshUserState = useCallback(async () => {
    if (auth.currentUser) {
      try {
        // Reload the Firebase user to get the latest data
        await reload(auth.currentUser);
        // Update our user state with the refreshed Firebase user
        await updateUserState(auth.currentUser);
      } catch (error) {
        console.error("Error refreshing user state:", error);
      }
    }
  }, [updateUserState]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        await updateUserState(firebaseUser);
        
        // Register for push notifications if user is authenticated
        if (firebaseUser) {
          try {
            // Register for push notifications and save token to user profile
            await initializePushNotifications(firebaseUser.uid);
            
          } catch (notifError) {
            console.error('Error initializing push notifications:', notifError);
            // Don't block the auth flow if push registration fails
          }
        }
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [updateUserState]);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // First create the authentication user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Send verification email
      await sendEmailVerification(userCredential.user);
      
      try {
        // Then try to create the user document in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          email,
          createdAt: new Date(),
          profileCompleted: false
        });
      } catch (firestoreError) {
        console.error("Error creating user document:", firestoreError);
        // Even if Firestore fails, the user is still authenticated
        // This ensures they can at least use the app even if profile data isn't stored yet
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      // Check if Google Play Services are available
      await GoogleSignin.hasPlayServices();
      
      // Get Google Sign-In response
      const response = await GoogleSignin.signIn();
      
      if (response.type === 'success') {
        const { idToken } = response.data;
        
        // Create Firebase credential with the Google ID token
        const googleCredential = GoogleAuthProvider.credential(idToken);
        
        // Sign in to Firebase with the Google credential
        const userCredential = await signInWithCredential(auth, googleCredential);
        const firebaseUser = userCredential.user;
        
        // Check if this is a new user or existing user
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
          // New user - create user document in Firestore
          await setDoc(userRef, {
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            createdAt: new Date(),
            profileCompleted: false,
            signInMethod: 'google'
          });
        }
        
        // The user state will be updated automatically through onAuthStateChanged
      } else {
        throw new Error('Google Sign-In was cancelled or failed');
      }
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      
      // Handle specific Google Sign-In errors
      if (error.code === 'auth/account-exists-with-different-credential') {
        throw new Error('An account already exists with the same email address but different sign-in credentials.');
      } else if (error.code === 'auth/invalid-credential') {
        throw new Error('The credential received is malformed or has expired.');
      } else if (error.code === 'auth/operation-not-allowed') {
        throw new Error('Google Sign-In is not enabled for this project.');
      } else if (error.code === 'auth/user-disabled') {
        throw new Error('The user account has been disabled.');
      } else {
        throw error;
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

// Updated logout function for your AuthContext.tsx
const logout = useCallback(async () => {
  const currentUserId = auth.currentUser?.uid; // Get user ID before sign-out operations

  setIsLoading(true); // Set loading true at the beginning of logout
  try {
    if (currentUserId) {
      try {
       
        await unregisterFromPushNotifications(currentUserId);
      } catch (unregError) {
        console.error(`AuthContext: Error unregistering push token for ${currentUserId}:\\`, unregError);
        // Decide if this error should prevent logout or just be logged.
        // For now, we'll log it and proceed with logout.
      }
    }

    // Always try to sign out from Google - it's safe to call even if not signed in
    try {
      await GoogleSignin.signOut();
      
    } catch (googleError) {
      // This is expected if user wasn't signed in with Google or if already signed out
      console.log("AuthContext: Google sign out not needed or failed (this is often normal):", googleError);
    }
    
    // Sign out from Firebase
    await signOut(auth);

    
    // User state will be set to null by onAuthStateChanged, which will also set isLoading to false.
    return true;
  } catch (error) {
    console.error("AuthContext: Logout error:", error);
    // Ensure loading is false if logout fails catastrophically before onAuthStateChanged can clear it
    // However, onAuthStateChanged should ideally always fire after signOut attempt.
    // If signOut itself fails, onAuthStateChanged might not fire with null.
    // Setting isLoading(false) here ensures UI is unblocked if signOut itself throws.
    setIsLoading(false); 
    return false;
  }
  // isLoading will be set to false by the onAuthStateChanged listener when user becomes null
  // or if an error occurs and is caught above.
}, []); // No dependencies needed here as auth.currentUser is accessed directly

  const setUserHasProfile = useCallback((hasProfile: boolean) => {
    if (user) {
      setUser({ ...user, hasProfile });
    }
  }, [user]);

  const sendVerification = useCallback(async () => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
      } catch (error) {
        throw error;
      }
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      // Re-throw the error to be handled in the component
      throw error;
    }
  }, []);

  // Add a function to verify admin status via cloud function
  const checkAdminStatus = useCallback(async () => {
    if (auth.currentUser) {
      try {
        const checkAdmin = httpsCallable(functions, 'checkAdminStatus');
        const result = await checkAdmin();
        
        // Update user state with admin status
        if (user) {
          setUser({ ...user, isAdmin: result.data as boolean });
        }
        
        return result.data as boolean;
      } catch (error) {
        console.error("Error checking admin status:", error);
        return false;
      }
    }
    return false;
  }, [user]);

  const value = useMemo(() => ({
    user,
    isLoading,
    signIn,
    signUp,
    signInWithGoogle,
    logout,
    setUserHasProfile,
    sendVerification,
    refreshUserState,
    resetPassword,
    checkAdminStatus
  }), [user, isLoading, signIn, signUp, signInWithGoogle, logout, setUserHasProfile, sendVerification, refreshUserState, resetPassword, checkAdminStatus]);

  return (
    <AuthContext.Provider value={value}>
      {isLoading ? <Loader isLoading={true} /> : children}
    </AuthContext.Provider>
  );
};