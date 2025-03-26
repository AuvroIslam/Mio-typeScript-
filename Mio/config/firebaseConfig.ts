// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from '@react-native-async-storage/async-storage';
// Note: We're not using Firebase Storage in this app
// Instead, we store image URLs from Cloudinary in Firestore

// Your web app's Firebase configuration
// For production, these values should be set in environment variables
// or using a secure key management solution
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyD4ZIhFU1zMrWLVjBIbxzg6QwPlBqgDa4E",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "mioapp-9a5bd.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "mioapp-9a5bd",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "mioapp-9a5bd.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "502497349839",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:502497349839:web:f4d6dc6a0d2345afbf27ba"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Auth with AsyncStorage persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
const db = getFirestore(app);

export { auth, db }; 