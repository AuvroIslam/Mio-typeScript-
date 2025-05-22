import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
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

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Catch any errors thrown by the Layout component
export { ErrorBoundary } from 'expo-router';

// NEW: Auth Navigation Handler Component
const AuthNavigationHandler = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only handle navigation when not loading
    if (!isLoading) {
      if (!user) {
        // User is logged out, redirect to index (splash screen)
        console.log("User logged out, redirecting to index");
        router.replace("/");
      }
      // If user exists, let the existing logic in index.tsx handle the navigation
    }
  }, [user, isLoading, router]);

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
                <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                  <Slot />
                  <StatusBar style="auto" />
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