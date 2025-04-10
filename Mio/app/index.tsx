import { View, StyleSheet, ImageBackground, Platform } from 'react-native'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import backgroundImage from '../assets/images/background_splash.jpg'
import { CustomButton, Loader } from "../components";
import { useAuth } from '../context/AuthContext';

import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [appLoading, setAppLoading] = useState(true);
  const [comingFromAuth, setComingFromAuth] = useState(false);

  // When this component mounts, check if there's a flag indicating we came from a failed auth attempt
  useEffect(() => {
    const checkAuthError = async () => {
      try {
        const authError = await AsyncStorage.getItem('auth_error');
        if (authError === 'true') {
          setComingFromAuth(true);
          // Clear the flag so future navigations work properly
          await AsyncStorage.removeItem('auth_error');
        }
      } catch (e) {
        console.error('Could not check AsyncStorage:', e);
      }
    };
    
    checkAuthError();
  }, []);

  useEffect(() => {
    // Check authentication state and redirect accordingly
    if (!isLoading) {
      const timer = setTimeout(() => {
        if (user) {
          // User is authenticated
          if (!user.emailVerified) {
            // Email not verified, go to verification page
            router.replace("/(auth)/email-verification");
          } else if (user.hasProfile) {
            // User has a profile and is verified, go to main app
            router.replace("/(tabs)/home");
          } else {
            // User is authenticated and verified but needs to complete profile
            router.replace("/(registration)/registration");
          }
        } else if (!comingFromAuth) {
          // If not coming from a failed auth attempt, proceed normally
          // This prevents redirection loops with the sign-in page
        }
        setAppLoading(false);
      }, 2000); // Add a small delay for better UX
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, user, router, comingFromAuth]);

  const handleEmailSignIn = () => {
    router.push('/sign-up');
  };

  if (isLoading || appLoading) {
    return <Loader isLoading={true} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
        <SafeAreaView style={styles.container}>
          <View style={styles.contentContainer}>
            {!user && (
              
              <View style={styles.buttonContainer}>
                
                <CustomButton
                  title="Continue with Email"
                  handlePress={handleEmailSignIn}
                  containerStyles="mt-7"
                  textStyles="font-pacifico"
                />
              </View>
            )}
          </View>
        </SafeAreaView>
      </ImageBackground>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    ...Platform.select({
      web: {
        width: '100%',
        height: '100%',
      }
    })
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: -40,
  },
  
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 10
  }
});
