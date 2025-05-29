import React, { useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform, Modal, Text, TouchableOpacity, View, StyleSheet, Linking } from 'react-native';
import 'react-native-reanimated';
import '../global.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { FavoritesProvider } from '../context/FavoritesContext';
import { RegistrationProvider } from '../context/RegistrationContext';
import { MatchContextProvider } from '../context/MatchContext';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../components';
import { useColorScheme } from '../hooks/useColorScheme';
import { initializeNotifications, setNotificationResponseHandler, setForegroundNotificationHandler } from '../utils/notificationHandler';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { COLORS } from '../constants/Colors';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Catch any errors thrown by the Layout component
export { ErrorBoundary } from 'expo-router';

// Auth and Notification Handler Component
const AuthNavigationHandler = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const notificationReceivedRef = useRef(false);

  // Initialize Firebase and notifications on component mount
  useEffect(() => {
    // Ensure notifications are initialized after Firebase
    initializeNotifications();
  }, []);

  // Handle authentication navigation
  useEffect(() => {
    // Only handle navigation when not loading
    if (!isLoading) {
      if (!user) {
        // User is logged out, redirect to index (splash screen)
       
        router.replace("/");
      }
      // If user exists, let the existing logic in index.tsx handle the navigation
    }
  }, [user, isLoading, router]);

  // Handle notifications when app is in background
  useEffect(() => {
    if (!user) return;

    // Set up notification response handler (when user taps notification)
    const unsubscribe = setNotificationResponseHandler((data) => {
      // Handle notification based on type
      if (data?.type === 'match') {
        const matchId = data.matchId;
        
        
        // Navigate to match tab
        if (matchId) {
          router.navigate({ pathname: '/(tabs)/match' });
        }
      }
    });

    // Set up foreground notification handler
    const foregroundUnsubscribe = setForegroundNotificationHandler((notification) => {
      const data = notification.request.content.data;
      
      // Avoid showing toast multiple times for same notification
      if (notificationReceivedRef.current) return;
      notificationReceivedRef.current = true;
      
      // Show toast for new match
      if (data?.type === 'match') {
        Toast.show({
          type: 'success',
          text1: notification.request.content.title || 'New Match!',
          text2: notification.request.content.body || 'You have a new match!',
          visibilityTime: 4000,
          onHide: () => {
            notificationReceivedRef.current = false;
          }
        });
      }
    });

    return () => {
      unsubscribe();
      foregroundUnsubscribe();
    };
  }, [user, router]);

  return <>{children}</>;
};

const RootLayout = () => {
  const [isUpdateModalVisible, setIsUpdateModalVisible] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateUrl, setUpdateUrl] = useState('');
  const colorScheme = useColorScheme();
  const [fontsLoaded, error] = useFonts({
    "Poppins-Black": require("../assets/fonts/Poppins-Black.ttf"),
    "Poppins-Bold": require("../assets/fonts/Poppins-Bold.ttf"),
    "Poppins-ExtraBold": require("../assets/fonts/Poppins-ExtraBold.ttf"),
    "Poppins-ExtraLight": require("../assets/fonts/Poppins-ExtraLight.ttf"),
    "Poppins-Light": require("../assets/fonts/Poppins-Light.ttf"),
    "Poppins-Medium": require("../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-SemiBold": require("../assets/fonts/Poppins-SemiBold.ttf"),
    "Poppins-Thin": require("../assets/fonts/Poppins-Thin.ttf"),
    "Pacifico-Regular": require("../assets/fonts/Pacifico.ttf"),
  });

  useEffect(() => {
    if (error) throw error;

    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, error]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const currentAppVersion = Application.nativeBuildVersion;
    if (!currentAppVersion) {
      console.warn('Could not determine app version.');
      return;
    }
    const currentAppVersionCode = parseInt(currentAppVersion, 10);

    const unsubscribe = onSnapshot(doc(db, 'appConfig', 'versions'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const minVersionCode = data?.android_minimum_version_code;
        const message = data?.android_update_message;
        const url = data?.android_update_url;

        if (typeof minVersionCode === 'number' && message && url) {
          if (currentAppVersionCode < minVersionCode) {
            setUpdateMessage(message);
            setUpdateUrl(url);
            setIsUpdateModalVisible(true);
          } else {
            setIsUpdateModalVisible(false); // Ensure modal is hidden if version is okay
          }
        } else {
          console.warn('Firestore appConfig/versions document is missing required fields: android_minimum_version_code, android_update_message, android_update_url.');
          setIsUpdateModalVisible(false);
        }
      } else {
        console.warn('Firestore appConfig/versions document does not exist.');
        setIsUpdateModalVisible(false);
      }
    }, (error) => {
      console.error('Error fetching app config for force update:', error);
      setIsUpdateModalVisible(false);
    });

    return () => unsubscribe(); // Cleanup listener on component unmount
  }, []);

  if (!fontsLoaded && !error) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AuthNavigationHandler>
          <RegistrationProvider>
            <FavoritesProvider>
              <MatchContextProvider>
                <ThemeProvider value={colorScheme === 'dark' ? DefaultTheme : DefaultTheme}>
                  <Slot />
                  <StatusBar backgroundColor="#FFFFFF" style="dark" />
                  <Toast config={toastConfig} />
                  {isUpdateModalVisible && (
                    <Modal
                      transparent={true}
                      animationType="slide"
                      visible={isUpdateModalVisible}
                      onRequestClose={() => { /* Non-dismissible modal */ }}
                    >
                      <View style={styles.modalContainer}>
                        <View style={styles.modalContent}>
                          <Text style={styles.modalTitle}>Update Required</Text>
                          <Text style={styles.modalMessage}>{updateMessage}</Text>
                          <TouchableOpacity
                            style={styles.updateButton}
                            onPress={async () => {
                              if (updateUrl) {
                                const supported = await Linking.canOpenURL(updateUrl);
                                if (supported) {
                                  await Linking.openURL(updateUrl);
                                } else {
                                  console.error(`Don't know how to open this URL: ${updateUrl}`);
                                  // Optionally, show an alert to the user
                                }
                              }
                            }}
                          >
                            <Text style={styles.updateButtonText}>Update Now</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Modal>
                  )}
                </ThemeProvider>
              </MatchContextProvider>
            </FavoritesProvider>
          </RegistrationProvider>
        </AuthNavigationHandler>
      </AuthProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  updateButton: {
    backgroundColor: COLORS.darkMaroon,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  updateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default RootLayout;