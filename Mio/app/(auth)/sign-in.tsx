import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
    ScrollView,
    Modal,
    TextInput,
    ImageBackground,
    ActivityIndicator // Keep ActivityIndicator if used elsewhere, not needed for this specific change
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
// Assuming Loader handles its own visibility based on isLoading prop
import { CustomButton, InputField, Loader } from '../../components';
import { useAuth } from '../../context/AuthContext';
// Keep Toast for other messages if needed, but we won't use it for login failure here
import Toast from 'react-native-toast-message';
import { COLORS } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SignIn = () => {
  const router = useRouter();
    // Destructure isLoading correctly from useAuth if it's provided for general loading
    const { signIn, isLoading: authContextLoading, user, resetPassword } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
    const [validationErrors, setValidationErrors] = useState({ email: '', password: '' });
    // --- New State for Login Error ---
    const [signInError, setSignInError] = useState<string | null>(null);
    // --- Renamed state for clarity ---
    const [isProcessingSignIn, setIsProcessingSignIn] = useState(false);

    const [forgotPasswordModalVisible, setForgotPasswordModalVisible] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetEmailError, setResetEmailError] = useState('');
    const [processingReset, setProcessingReset] = useState(false);

    // --- Effect for redirecting logged-in user (keep as is) ---
  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
                if (!user.emailVerified) {
                    router.replace("/(auth)/email-verification");
                } else if (user.hasProfile) {
        router.replace("/(tabs)/home");
                } else {
                    router.replace("/(registration)/registration");
                }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user, router]);

    // --- Clear sign-in error when inputs change ---
    useEffect(() => {
       if (signInError) {
           setSignInError(null);
       }
    }, [email, password]);

    // Make sure we stay on the sign-in page when there's an error
    useEffect(() => {
        if (signInError) {
            // If there's an error, stay on the sign-in page
            const preventRedirect = () => {
                if (router.canGoBack()) {
                    // If user tries to navigate away with errors present, force back to sign-in
                    router.replace('/sign-in');
                }
            };
            
            preventRedirect();
            
            // Block any navigation attempts for a short period to ensure we stay on sign-in page
            const blockTimer = setTimeout(() => {
                router.replace('/sign-in');
            }, 250);
            
            return () => clearTimeout(blockTimer);
        }
    }, [signInError, router]);

  const validateForm = () => {
    let valid = true;
    const newErrors = { email: '', password: '' };
        setSignInError(null); // Clear previous login errors on new attempt

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
    }
        // Keep password length validation if desired
        // else if (password.length < 6) {
        //   newErrors.password = 'Password must be at least 6 characters';
        //   valid = false;
        // }

        setValidationErrors(newErrors);
    return valid;
  };

  const handleSignIn = async () => {
    if (!validateForm()) {
             // Show validation errors inline (already handled by InputField `error` prop)
             // Optionally, focus the first invalid field
      return;
    }
    
        setIsProcessingSignIn(true);
        setSignInError(null); // Clear previous errors

    try {
           
      await signIn(email, password);
            
            // Success: Navigation is handled by the useEffect hook watching the `user` state
            // You could show a success toast here if you still want one for successful login
      Toast.show({
        type: 'success',
        text1: 'Welcome back!',
        position: 'bottom',
        visibilityTime: 2000
      });
    } catch (error: any) {
            console.error("Sign In Failed:", error); // Log the actual error
            
            // IMPORTANT: Clear password for better security
            setPassword('');
            
            // IMPORTANT: Show a very visible error message
            let errorMessage = 'An unexpected error occurred. Please try again.';
            
            // Set specific error message based on error code
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                errorMessage = 'Invalid email or password. Please try again.';
      } else if (error.code === 'auth/too-many-requests') {
                errorMessage = 'Too many attempts. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
                errorMessage = 'Network error. Check connection and try again.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'The email format is invalid.';
            }
            
            // Set inline error message
            setSignInError(errorMessage);
            
            // Show a very visible toast notification
            // Using setTimeout to ensure it shows even if navigation attempts happen
            setTimeout(() => {
        Toast.show({
          type: 'error',
          text1: 'Sign In Failed',
                    text2: errorMessage,
                    position: 'top', // Position at top for better visibility
                    visibilityTime: 5000, // Show for longer
                    topOffset: 50, // Lower from the top edge
                    props: { // Make it extra visible
                        style: {
                            borderLeftColor: 'red',
                            borderLeftWidth: 10,
                        },
                    }
                });
            }, 500);
            
            // Force navigation to stay on sign-in page
            router.replace('/sign-in');
        } finally {
             // Important: Set processing to false regardless of success or failure
             setIsProcessingSignIn(false);
            
        }
    };

    // --- Handle Forgot Password (keep as is) ---
    const handleForgotPassword = async () => {
        if (!resetEmail) {
            setResetEmailError('Please enter your email address.');
            return;
        } else if (!/\S+@\S+\.\S+/.test(resetEmail)) {
            setResetEmailError('Please enter a valid email address.');
            return;
        }
        setResetEmailError('');
        setProcessingReset(true);
        try {
            await resetPassword(resetEmail);
            setForgotPasswordModalVisible(false);
            setResetEmail('');
            Toast.show({ // Keep Toast for this feedback
                type: 'success',
                text1: 'Password Reset Email Sent',
                text2: 'Check your email to reset your password.',
                position: 'bottom',
                visibilityTime: 5000
            });
        } catch (error: any) {
            let errorMessage = 'Failed to send password reset email.';
             if (error.code === 'auth/user-not-found') {
               errorMessage = 'No user found with this email address.';
             } // ... other error checks
            Toast.show({ // Keep Toast for this feedback
                type: 'error',
                text1: 'Password Reset Failed',
                text2: errorMessage,
          position: 'bottom',
          visibilityTime: 4000
        });
        } finally {
            setProcessingReset(false);
    }
  };

    // Use the specific processing state for the loader
    if (authContextLoading) {
       // Use a full-screen loader if the context is initially loading the user
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
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            <InputField
              label="Email"
              value={email}
                                // Clear specific sign-in error when typing
                                onChangeText={(text) => {setEmail(text); setSignInError(null);}}
              placeholder="Enter your email"
              keyboardType="email-address"
                                error={validationErrors.email} // Show validation errors
            />

            <InputField
              label="Password"
              value={password}
                                // Clear specific sign-in error when typing
                                onChangeText={(text) => {setPassword(text); setSignInError(null);}}
              placeholder="Enter your password"
              secureTextEntry
                                error={validationErrors.password} // Show validation errors
                            />

                             {/* --- Display Sign-In Error Message --- */}
                             {signInError && (
                                <View style={styles.errorContainer}>
                                  <Text style={styles.signInErrorText}>{signInError}</Text>
                                </View>
                             )}

            <View style={styles.forgotPasswordContainer}>
                                <TouchableOpacity onPress={() => setForgotPasswordModalVisible(true)}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <CustomButton
              title="Sign In"
              handlePress={handleSignIn}
              containerStyles="mt-4 self-center"
                                // Use the specific processing state for the button
                                isLoading={isProcessingSignIn}
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

                 {/* --- Forgot Password Modal (keep as is) --- */}
                 <Modal
                    animationType="slide"
                    transparent={true}
                    visible={forgotPasswordModalVisible}
                    onRequestClose={() => { /* ... close logic ... */ }}
                 >
                   {/* ... Modal Content ... */}
                   <View style={styles.modalCenteredView}>
                     <View style={styles.modalView}>
                       <Text style={styles.modalTitle}>Reset Password</Text>
                       <Text style={styles.modalText}>Enter your email address below...</Text>
                       <TextInput
                         style={[styles.modalInput, resetEmailError ? styles.inputError : null]}
                         placeholder="Enter your email"
                         value={resetEmail}
                         onChangeText={setResetEmail}
                         keyboardType="email-address"
                         // ... other props
                       />
                       {resetEmailError ? <Text style={styles.errorText}>{resetEmailError}</Text> : null}
                       <CustomButton
                         title={processingReset ? 'Sending...' : 'Send Reset Email'}
                         handlePress={handleForgotPassword}
                         containerStyles="mt-4 self-stretch"
                         isLoading={processingReset}
                       />
                       <TouchableOpacity
                         style={styles.modalCloseButton}
                         onPress={() => { /* ... close logic ... */ }}
                       >
                         <Text style={styles.modalCloseText}>Cancel</Text>
                       </TouchableOpacity>
                     </View>
                   </View>
                 </Modal>

    </SafeAreaView>
        </ImageBackground>
  );
};

// --- Add Style for the new error text ---
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
  forgotPasswordContainer: { alignItems: 'flex-end', marginTop: 8, marginBottom: 12 }, // Added marginBottom
  forgotPasswordText: { color: COLORS.maroon, fontSize: 14 },
  signupContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  signupText: { color: '#666' },
  signupLink: { color: COLORS.maroon, fontWeight: 'bold' },

  // --- Style for the inline sign-in error ---
  signInErrorText: {
    color: COLORS.error,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 10,
    padding: 10,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: 8,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.error,
  },

  // --- Modal Styles (keep as is) ---
   modalCenteredView: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
   modalView: { margin: 20, backgroundColor: 'white', borderRadius: 20, padding: 35, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, width: '90%' },
   modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: COLORS.secondary },
   modalText: { marginBottom: 15, textAlign: 'center', color: '#666' },
   modalInput: { height: 45, borderColor: '#ddd', borderWidth: 1, borderRadius: 8, marginBottom: 5, paddingHorizontal: 15, width: '100%', fontSize: 16 },
   inputError: { borderColor: COLORS.error },
   errorText: { color: COLORS.error, fontSize: 12, marginBottom: 10, alignSelf: 'flex-start' },
   modalCloseButton: { marginTop: 15 },
   modalCloseText: { color: COLORS.secondary, fontWeight: 'bold' },
});

export default SignIn;