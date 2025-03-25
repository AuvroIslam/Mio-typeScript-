import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView,
  Alert
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomButton, InputField, Loader } from '../../components';
import { useAuth } from '../../context/AuthContext';

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

  // Handle redirection to registration after successful signup
  useEffect(() => {
    if (registrationReady && user) {
      // Use setTimeout to ensure navigation happens after layout is fully mounted
      const timer = setTimeout(() => {
        router.push("/(registration)/registration");
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
    if (!validateForm()) return;

    setProcessingAuth(true);
    try {
      await signUp(email, password);
      setRegistrationReady(true);
      // Navigation will be handled in the useEffect when registrationReady is true
    } catch (error: any) {
      console.error('Sign up error:', error);
      
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Error', 'This email is already in use. Please try a different email or sign in.');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('Error', 'The email address is not valid.');
      } else if (error.code === 'auth/weak-password') {
        Alert.alert('Error', 'The password is too weak. Please choose a stronger password.');
      } else if (error.code === 'auth/network-request-failed') {
        Alert.alert('Error', 'Network error. Please check your internet connection and try again.');
      } else {
        Alert.alert('Error', 'Failed to create account. Please try again later.');
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
              containerStyles="mt-4"
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
  signinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  signinText: {
    color: '#666',
  },
  signinLink: {
    color: '#8174A0',
    fontWeight: 'bold',
  },
});

export default SignUp;