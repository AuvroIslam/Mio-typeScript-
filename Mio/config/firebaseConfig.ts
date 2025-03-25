// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from '@react-native-async-storage/async-storage';
// Note: We're not using Firebase Storage in this app
// Instead, we store image URLs from Cloudinary in Firestore

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD4ZIhFU1zMrWLVjBIbxzg6QwPlBqgDa4E",
  authDomain: "mioapp-9a5bd.firebaseapp.com",
  projectId: "mioapp-9a5bd",
  storageBucket: "mioapp-9a5bd.appspot.com",
  messagingSenderId: "502497349839",
  appId: "1:502497349839:web:f4d6dc6a0d2345afbf27ba"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Auth with AsyncStorage persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
const db = getFirestore(app);

export { auth, db }; 