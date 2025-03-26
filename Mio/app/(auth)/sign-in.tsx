import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomButton, InputField, Loader } from '../../components';
import { useAuth } from '../../context/AuthContext';
import Toast from 'react-native-toast-message';

const SignIn = () => {
  const router = useRouter();
  const { signIn, isLoading, user } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [processingAuth, setProcessingAuth] = useState(false);

  // Check if user is already authenticated and redirect if needed
  useEffect(() => {
    if (user) {
      // Use setTimeout to ensure navigation happens after layout is fully mounted
      const timer = setTimeout(() => {
        router.replace("/(tabs)/home");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user, router]);

  const validateForm = () => {
    let valid = true;
    const newErrors = { email: '', password: '' };

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

    setErrors(newErrors);
    return valid;
  };

  const handleSignIn = async () => {
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
      return;
    }
    
    setProcessingAuth(true);
    try {
      await signIn(email, password);
      // Navigation will be handled in the useEffect when user state changes
    } catch (error: any) {
      // Provide more specific error messages based on error code
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        Toast.show({
          type: 'error',
          text1: 'Invalid Credentials',
          text2: 'Email or password is incorrect. Please try again.',
          position: 'bottom',
          visibilityTime: 4000
        });
      } else if (error.code === 'auth/too-many-requests') {
        Toast.show({
          type: 'error',
          text1: 'Too Many Attempts',
          text2: 'Too many failed login attempts. Please try again later.',
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
          text1: 'Sign In Failed',
          text2: 'Could not sign in. Please try again later.',
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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollView}>
          <View style={styles.logoContainer}>
            <Text style={styles.logo}>Mio</Text>
          </View>

          <View style={styles.formContainer}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

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
              placeholder="Enter your password"
              secureTextEntry
              error={errors.password}
            />

            <View style={styles.forgotPasswordContainer}>
              <TouchableOpacity>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <CustomButton
              title="Sign In"
              handlePress={handleSignIn}
              containerStyles="mt-4"
            />

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <Link href="/sign-up" asChild>
                <TouchableOpacity>
                  <Text style={styles.signupLink}>Sign Up</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFCCE1',
  },
  scrollView: {
    flexGrow: 1,
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#8174A0',
  },
  formContainer: {
    backgroundColor: '#F2F9FF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8174A0',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    marginBottom: 24,
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  forgotPasswordText: {
    color: '#8174A0',
    fontSize: 14,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  signupText: {
    color: '#666',
  },
  signupLink: {
    color: '#8174A0',
    fontWeight: 'bold',
  },
});

export default SignIn;