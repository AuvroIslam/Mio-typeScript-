import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerForPushNotificationsAsync } from './registerForPushNotificationsAsync';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Initialize notification settings and handlers
 */
export function initializeNotifications(): void {
  // Configure notification appearance for foreground
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }
}

/**
 * Set up notification response handler
 * @param navigationCallback Function to navigate based on notification data
 */
export function setNotificationResponseHandler(
  navigationCallback: (data: any) => void
): () => void {
  // Handle notification being tapped and app opened from background state
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    navigationCallback(data);
  });
  
  // Return cleanup function
  return () => {
    subscription.remove();
  };
}

/**
 * Set up handler for notifications received while app is in foreground
 * @param callback Function to handle foreground notification
 */
export function setForegroundNotificationHandler(
  callback: (notification: Notifications.Notification) => void
): () => void {
  // Handle notification received while app is in foreground
  const subscription = Notifications.addNotificationReceivedListener(notification => {
    callback(notification);
  });
  
  // Return cleanup function
  return () => {
    subscription.remove();
  };
}

/**
 * Initialize push notifications for user
 * @param userId User ID to register
 */
export async function initializePushNotifications(userId: string): Promise<string | null> {
  try {
    const token = await registerForPushNotificationsAsync(userId);
    return token;
  } catch (error) {
    console.error('Error initializing push notifications:', error);
    return null;
  }
}
