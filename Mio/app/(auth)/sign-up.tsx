import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView,
  ImageBackground
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomButton, InputField, Loader } from '../../components';
import { useAuth } from '../../context/AuthContext';
import Toast from 'react-native-toast-message';
import {  COLORS } from '../../constants/Colors';


const SignUp = () => {
  const router = useRouter();
  const { signUp, isLoading, user } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [processingAuth, setProcessingAuth] = useState(false);
  const [registrationReady, setRegistrationReady] = useState(false);
  const [errors, setErrors] = useState({ 
    email: '', 
    password: '',
    confirmPassword: ''
  });

  // Handle redirection to email verification after successful signup
  useEffect(() => {
    if (registrationReady && user) {
      // Use setTimeout to ensure navigation happens after layout is fully mounted
      const timer = setTimeout(() => {
        router.push("/(auth)/email-verification");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [registrationReady, user, router]);

  const validateForm = () => {
    let valid = true;
    const newErrors = { 
      email: '', 
      password: '',
      confirmPassword: ''
    };

    if (!email) {
      newErrors.email = 'Email is required';
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
      valid = false;
    }

    if (!password) {
      newErrors.password = 'Password is required';
      valid = false;
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
      valid = false;
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
      valid = false;
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleSignUp = async () => {
    if (!validateForm()) {
      // Show toast for validation errors
      if (errors.email) {
        Toast.show({
          type: 'error',
          text1: 'Invalid Email',
          text2: errors.email,
          position: 'bottom'
        });
        return;
      }
      if (errors.password) {
        Toast.show({
          type: 'error',
          text1: 'Invalid Password',
          text2: errors.password,
          position: 'bottom'
        });
        return;
      }
      if (errors.confirmPassword) {
        Toast.show({
          type: 'error',
          text1: 'Password Error',
          text2: errors.confirmPassword,
          position: 'bottom'
        });
        return;
      }
      return;
    }

    setProcessingAuth(true);
    try {
      await signUp(email, password);
      Toast.show({
        type: 'success',
        text1: 'Success!',
        text2: 'Account created successfully',
        position: 'bottom',
        visibilityTime: 2000
      });
      setRegistrationReady(true);
      // Navigation will be handled in the useEffect when registrationReady is true
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        Toast.show({
          type: 'error',
          text1: 'Email In Use',
          text2: 'This email is already in use. Please try a different email or sign in.',
          position: 'bottom',
          visibilityTime: 4000
        });
      } else if (error.code === 'auth/invalid-email') {
        Toast.show({
          type: 'error',
          text1: 'Invalid Email',
          text2: 'The email address is not valid.',
          position: 'bottom',
          visibilityTime: 4000
        });
      } else if (error.code === 'auth/weak-password') {
        Toast.show({
          type: 'error',
          text1: 'Weak Password',
          text2: 'The password is too weak. Please choose a stronger password.',
          position: 'bottom',
          visibilityTime: 4000
        });
      } else if (error.code === 'auth/network-request-failed') {
        Toast.show({
          type: 'error',
          text1: 'Network Error',
          text2: 'Please check your internet connection and try again.',
          position: 'bottom',
          visibilityTime: 4000
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Sign Up Failed',
          text2: 'Failed to create account. Please try again later.',
          position: 'bottom',
          visibilityTime: 4000
        });
      }
      setProcessingAuth(false);
    }
  };

  if (isLoading || processingAuth) {
    return <Loader isLoading={true} />;
  }

  return (
    <ImageBackground 
      source={require('../../assets/images/signinBackground.jpg')}
      style={styles.backgroundImage}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollView}>
            <View style={styles.logoContainer}>
              
            </View>

            <View style={styles.formContainer}>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Sign up to get started</Text>

              <InputField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                keyboardType="email-address"
                error={errors.email}
              />

              <InputField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Create a password"
                secureTextEntry
                error={errors.password}
              />

              <InputField
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                secureTextEntry
                error={errors.confirmPassword}
              />

              <CustomButton
                title="Sign Up"
                handlePress={handleSignUp}
                containerStyles="mt-4 self-center"
              />

              <View style={styles.signinContainer}>
                <Text style={styles.signinText}>Already have an account? </Text>
                <Link href="/sign-in" asChild>
                  <TouchableOpacity>
                    <Text style={styles.signinLink}>Sign In</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
 
  formContainer: {
    height:'60%',
    marginTop: 80,
    padding: 25,
    width: '100%',
    
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.darkestMaroon,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    marginBottom: 18,
    textAlign: 'center',
  },
  signinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  signinText: {
    color: '#666',
  },
  signinLink: {
    color: COLORS.maroon,
    fontWeight: 'bold',
  },
});

export default SignUp;