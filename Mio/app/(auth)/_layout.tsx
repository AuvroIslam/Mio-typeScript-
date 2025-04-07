import React from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../components';

const AuthLayout = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack 
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#ffffff' },
          }} 
        />
        <Toast config={toastConfig} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default AuthLayout;