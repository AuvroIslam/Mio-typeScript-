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

// Event emitter for logout
import { EventEmitter } from 'events';
export const logoutEventEmitter = new EventEmitter();
export const LOGOUT_EVENT = 'user_logout';

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
      
      // Check if user is an admin (based on email)
      const isAdmin = firebaseUser.email === 'oitijya2002@gmail.com';

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
      // 1. First emit logout event so components can unsubscribe from Firestore listeners
      logoutEventEmitter.emit(LOGOUT_EVENT);
      
      // 2. Wait longer to ensure ALL listeners have time to unsubscribe
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 3. Now sign out
      await signOut(auth);
      
      // 4. Wait a moment for sign out to complete before returning
      await new Promise(resolve => setTimeout(resolve, 100));
      
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

  const value = useMemo(() => ({
    user,
    isLoading,
    signIn,
    signUp,
    logout,
    setUserHasProfile,
    sendVerification,
    refreshUserState,
    resetPassword
  }), [user, isLoading, signIn, signUp, logout, setUserHasProfile, sendVerification, refreshUserState, resetPassword]);

  return (
    <AuthContext.Provider value={value}>
      {isLoading ? <Loader isLoading={true} /> : children}
    </AuthContext.Provider>
  );
}; 