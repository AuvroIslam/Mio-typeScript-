import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { Loader } from '../components';

interface User {
  uid: string;
  email: string | null;
  displayName?: string | null;
  hasProfile?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUserHasProfile: (hasProfile: boolean) => void;
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Check if user has profile data
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);
        const hasProfile = userDoc.exists() && userDoc.data().profileCompleted;

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          hasProfile
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // First create the authentication user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      try {
        // Then try to create the user document in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          email,
          createdAt: new Date(),
          profileCompleted: false
        });
      } catch (firestoreError) {
        console.error('Firestore error during sign up:', firestoreError);
        // Even if Firestore fails, the user is still authenticated
        // This ensures they can at least use the app even if profile data isn't stored yet
      }
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const setUserHasProfile = (hasProfile: boolean) => {
    if (user) {
      setUser({ ...user, hasProfile });
    }
  };

  const value = {
    user,
    isLoading,
    signIn,
    signUp,
    logout,
    setUserHasProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {isLoading ? <Loader isLoading={true} /> : children}
    </AuthContext.Provider>
  );
}; 