import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendEmailVerification,
  reload,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { Loader } from '../components';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface User {
  uid: string;
  email: string | null;
  displayName?: string | null;
  hasProfile?: boolean;
  isAdmin?: boolean;
  emailVerified?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
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
        emailVerified: firebaseUser.emailVerified
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

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      // Just sign out without any navigation
      await signOut(auth);
      return true; // Return success status
    } catch (error) {
      console.error("Logout error:", error);
      return false; // Return failure status
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        const functions = getFunctions();
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
    logout,
    setUserHasProfile,
    sendVerification,
    refreshUserState,
    resetPassword,
    checkAdminStatus
  }), [user, isLoading, signIn, signUp, logout, setUserHasProfile, sendVerification, refreshUserState, resetPassword, checkAdminStatus]);

  return (
    <AuthContext.Provider value={value}>
      {isLoading ? <Loader isLoading={true} /> : children}
    </AuthContext.Provider>
  );
}; 