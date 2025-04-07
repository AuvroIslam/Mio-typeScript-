// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from '@react-native-async-storage/async-storage';
// Using Firebase Storage for message archives and Cloudinary for profile images

// Your web app's Firebase configuration
// Reads values from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

// Validate that all Firebase config values are present
const requiredKeys: (keyof typeof firebaseConfig)[] = [
  'apiKey', 
  'authDomain', 
  'projectId', 
  'storageBucket', 
  'messagingSenderId', 
  'appId'
];

for (const key of requiredKeys) {
  if (!firebaseConfig[key]) {
    throw new Error(`Firebase configuration error: Missing environment variable EXPO_PUBLIC_FIREBASE_${key.toUpperCase().replace('ID', '_ID')}`); // Basic transformation for key name
  }
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Auth with AsyncStorage persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage }; 