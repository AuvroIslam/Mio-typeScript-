// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from '@react-native-async-storage/async-storage';
// Note: We're not using Firebase Storage in this app
// Instead, we store image URLs from Cloudinary in Firestore

// Your web app's Firebase configuration
// For production, these values should be set in environment variables
// or using a secure key management solution
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyAZ6fGB3lQSNfYrSAnk123aS78pGE4BlGE",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "mio-deployment.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "mio-deployment",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "mio-deployment.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "923851288668",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:923851288668:web:7fc5ba0eb44e259859b699"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Auth with AsyncStorage persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
const db = getFirestore(app);
// Initialize Storage
const storage = getStorage(app);

export { auth, db, storage }; 