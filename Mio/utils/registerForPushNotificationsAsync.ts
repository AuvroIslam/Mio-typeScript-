import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import Constants from 'expo-constants'; // Import Constants
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '../config/firebaseConfig'; // Import your Firebase config

/**
 * Registers device for push notifications and returns the token
 * Also saves the token to the user's profile in Firestore
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  let token;
  
  if (!Device.isDevice) {

    return null;
  }
  
  // Ensure Firebase is initialized - this helps with Android native Firebase init
  if (getApps().length === 0) {
   
    initializeApp(firebaseConfig);
  }

  // Check if we already have permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  // If we don't have permission, ask for it
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  // If we still don't have permission, exit
  if (finalStatus !== 'granted') {
  
    return null;
  }
  
  // Get the token
  const expoProjectId = Constants.expoConfig?.extra?.eas?.projectId || process.env.EXPO_PUBLIC_PROJECT_ID;

  if (!expoProjectId) {
    console.warn(
      "Expo Project ID not found. It was not available via Constants.expoConfig.extra.eas.projectId " +
      "or process.env.EXPO_PUBLIC_PROJECT_ID. Push notifications might not work as expected. " +
      "Ensure your Expo project ID is configured correctly in app.json (extra.eas.projectId) for EAS Build, " +
      "or in your .env file (EXPO_PUBLIC_PROJECT_ID) for local development."
    );
    // Depending on requirements, you might return null or throw an error here
    // if the projectId is absolutely essential and cannot be determined.
  }
  
  token = (await Notifications.getExpoPushTokenAsync({
    projectId: expoProjectId, 
  })).data;
  
  // Configure notification behavior for Android
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  // Save the token to Firestore
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'profile.pushToken': token
    });
  
  } catch (error) {
    console.error('Error saving push token to Firestore:', error);
  }

  return token;
}

/**
 * Unregisters the device from push notifications
 * Removes the token from the user's profile in Firestore
 */
export async function unregisterFromPushNotifications(userId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'profile.pushToken': null
    });
    
  } catch (error) {
    console.error('Error removing push token from Firestore:', error);
  }
}
