import { View, StyleSheet, ImageBackground, Platform, Image } from 'react-native'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import backgroundImage from '../assets/images/background_splash.jpg'
import { CustomButton, Loader } from "../components";
import { useAuth } from '../context/AuthContext';
import { GoogleSignin, GoogleSigninButton } from '@react-native-google-signin/google-signin';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const router = useRouter();
  const { user, isLoading, signInWithGoogle } = useAuth();
  const [appLoading, setAppLoading] = useState(true);
  const [comingFromAuth, setComingFromAuth] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  // Configure Google Sign-In
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: "923851288668-j7hfv34lfvfjd17fqs9gug3ahtr9hu78.apps.googleusercontent.com",
      profileImageSize: 150
    });
  }, []);

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

  const handleGoogleSignIn = async () => {
    if (isGoogleSigningIn) return; // Prevent multiple simultaneous calls
    
    setIsGoogleSigningIn(true);
    
    try {
      await signInWithGoogle();
      
      // Success toast will be shown briefly before navigation
      Toast.show({
        type: 'success',
        text1: 'Welcome!',
        text2: 'Successfully signed in with Google',
        position: 'bottom',
        visibilityTime: 2000
      });
      
    } catch (error: any) {
      console.error("Google sign in error:", error);
      
      // Show specific error messages
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      if (error.message.includes('cancelled')) {
        errorMessage = 'Sign-in was cancelled.';
      } else if (error.message.includes('account-exists-with-different-credential')) {
        errorMessage = 'An account with this email already exists. Please sign in with your original method.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message.includes('not enabled')) {
        errorMessage = 'Google Sign-In is currently unavailable.';
      }
      
      Toast.show({
        type: 'error',
        text1: 'Google Sign-In Failed',
        text2: errorMessage,
        position: 'top',
        visibilityTime: 4000,
        topOffset: 50
      });
      
    } finally {
      setIsGoogleSigningIn(false);
    }
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
                  containerStyles="mt-4"
                  textStyles="font-pacifico"
                  icon={<Image source={require('../assets/images/Email.png')} style={{ width: 24, height: 24, marginLeft: 24 }} />}
                />
               
               
                <CustomButton
                  title="Continue with Google"
                  handlePress={handleGoogleSignIn} // For now, calls the same function
                  containerStyles="mt-4 "
                  textStyles="font-pacifico" // Changed text color to black
                  icon={<Image source={require('../assets/images/Google.png')} style={{ width: 24, height: 24, marginLeft: 10 }} />}
                />

               
                
                {isGoogleSigningIn && (
                  <View style={styles.loadingContainer}>
                    <Loader isLoading={true} />
                  </View>
                )}
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
    marginBottom: -30,
    marginTop: -40,
    gap: 16,
  },

 
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
});