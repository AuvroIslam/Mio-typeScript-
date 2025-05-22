// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions"; // Add this import
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
// Using Firebase Storage for message archives and Cloudinary for profile images

// Your web app's Firebase configuration
// For production, these values should be set in environment variables
// or using a secure key management solution
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with conditional persistence
const auth = initializeAuth(app, {
  ...(Platform.OS !== 'web' && { 
    persistence: getReactNativePersistence(AsyncStorage) 
  })
});

const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app); // Add this line

export { auth, db, storage, functions }; // Export functions