import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Loader } from '../../components';

const RegistrationLayout = () => {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // Check if user is verified before allowing registration
  useEffect(() => {
    const checkAuthState = () => {
      if (!isLoading) {
        if (!user) {
          // If no user is logged in, redirect to sign-in
          router.replace('/sign-in');
        } else if (!user.emailVerified) {
          // If user is logged in but email is not verified, redirect to verification page
          router.replace('/(auth)/email-verification');
        }
        // If user is logged in and verified, allow access to registration
      }
    };
    
    // Initial check
    checkAuthState();
    
    // Set up an interval to periodically check auth state
    // This helps ensure the registration page stays in sync with auth state
    const intervalId = setInterval(checkAuthState, 1000);
    
    return () => clearInterval(intervalId);
  }, [user, isLoading, router]);

  if (isLoading) {
    return <Loader isLoading={true} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack 
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#FFCCE1' },
          }} 
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default RegistrationLayout; 