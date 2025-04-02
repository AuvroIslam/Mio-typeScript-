import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import '../global.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../context/AuthContext';
import { FavoritesProvider } from '../context/FavoritesContext';
import { RegistrationProvider } from '../context/RegistrationContext';
import { MatchContextProvider } from '../context/MatchContext';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../components';
import { useColorScheme } from '../hooks/useColorScheme';
import * as Updates from 'expo-updates';
import { Alert } from 'react-native';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Catch any errors thrown by the Layout component
export { ErrorBoundary } from 'expo-router';

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

  // Check for updates when the app starts
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          Alert.alert(
            "Update Available",
            "A new update is available. Restart the app to apply changes.",
            [
              { text: "Later", style: "cancel" },
              { text: "Restart", onPress: async () => await Updates.reloadAsync() }
            ]
          );
        }
      } catch (error) {
        console.log('Error checking for updates:', error);
      }
    };

    checkForUpdates();
  }, []);

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
      </AuthProvider>
    </GestureHandlerRootView>
  );
};

export default RootLayout;
