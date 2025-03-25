import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler'
import onboardingImage from '../assets/images/onboardLogo.png'
import logo from '../assets/images/mainLogo.png'
import { CustomButton, Loader } from "../components";
import { useAuth } from '../context/AuthContext';

export default function App() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [appLoading, setAppLoading] = useState(true);

  useEffect(() => {
    // Check authentication state and redirect accordingly
    if (!isLoading) {
      const timer = setTimeout(() => {
        if (user) {
          // User is authenticated
          if (user.hasProfile) {
            // User has a profile, go to main app
            router.replace("/(tabs)/home");
          } else {
            // User is authenticated but needs to complete profile
            router.replace("/(registration)/registration");
          }
        }
        setAppLoading(false);
      }, 2000); // Add a small delay for better UX
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, user, router]);

  const handleEmailSignIn = () => {
    router.push('/sign-in');
  };

  if (isLoading || appLoading) {
    return <Loader isLoading={true} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className='flex-1 bg-[#FFCCE1] h-full'>
        <ScrollView
          contentContainerStyle={{
            height: "100%",
          }}
        >
          <View className="w-full flex justify-center items-center h-full px-4">
            <View className='w-full justify-center items-center mb-4 '>
              <Image
                source={onboardingImage}
                style={{ width: 130, height: 84 }}
                resizeMode="contain"
              />
              <Text className='text-4xl text-[#8174A0] font-poppins-extrabold mt-2'>
                Mio
              </Text>
            </View>
          
            <Image
              source={logo}
              style={{ maxWidth: 380, width: '100%', height: 298 }}
              resizeMode="contain"
            />

            <View className="relative mt-5">
              <Text className="text-3xl text-white font-poppins-bold text-center">
              Like Cherry Blossoms,{"\n"}
              Friendships Bloom here
              </Text>
            </View>

            {!user && (
              <View style={styles.buttonContainer}>
                <CustomButton
                  title="Continue with Email"
                  handlePress={handleEmailSignIn}
                  containerStyles="mt-7"
                />
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
  }
});

