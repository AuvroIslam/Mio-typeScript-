import React from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
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
                </ThemeProvider>
              </MatchContextProvider>
            </FavoritesProvider>
          </RegistrationProvider>
        </AuthNavigationHandler>
      </AuthProvider>
    </GestureHandlerRootView>
  );
};

export default RootLayout;