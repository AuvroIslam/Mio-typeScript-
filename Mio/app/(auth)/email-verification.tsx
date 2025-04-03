import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomButton, Loader } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useEmailVerification } from '../../hooks/useEmailVerification';
import { COLORS } from '../../constants/Colors';
import signinBackground from '../../assets/images/signinBackground.jpg';

const EmailVerification = () => {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const {
    isCheckingStatus,
    verifying,
    resendDisabled,
    countdown,
    handleResendVerification,
    verified
  } = useEmailVerification();
  
  // Add extra effect to handle direct navigation if user is verified already
  useEffect(() => {
    if (user?.emailVerified) {
      // If already verified when component mounts, navigate to registration
      router.replace('/(registration)/registration');
    }
  }, [user, router]);

  const handleLogout = async () => {
    try {
      // First navigate, then logout to avoid navigation while unmounted
      router.replace('/sign-in');
      // Add a small delay to ensure navigation completes before logout
      setTimeout(async () => {
        try {
          await logout();
        } catch (error) {
          console.error("Error in delayed logout:", error);
        }
      }, 500);
    } catch (error) {
      console.error("Error navigating:", error);
      // Try just the logout if navigation fails
      try {
        await logout();
      } catch (logoutError) {
        console.error("Error in fallback logout:", logoutError);
      }
    }
  };

  if (isLoading) {
    return <Loader isLoading={true} />;
  }

  if (verified) {
    return (
      <ImageBackground source={signinBackground} style={styles.backgroundImage}>
        <SafeAreaView style={styles.container}>
          <View style={styles.contentContainer}>
            <View style={styles.card}>
              <Text style={styles.title}>Email Verified!</Text>
              <Text style={styles.message}>
                Redirecting you to complete your profile...
              </Text>
              <ActivityIndicator size="large" color={COLORS.secondary} style={styles.loader} />
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={signinBackground} style={styles.backgroundImage}>
      <SafeAreaView style={styles.container}>
        <View style={styles.contentContainer}>
          <View style={styles.card}>
            <Text style={styles.title}>Verify Your Email</Text>
            
            <Text style={styles.message}>
              We've sent a verification email to:
            </Text>
            <Text style={styles.email}>{user?.email}</Text>
            
            <Text style={styles.instructions}>
              Please check your inbox and click the verification link to complete your account setup.
              Once verified, you'll be automatically redirected.
            </Text>

            {isCheckingStatus && (
              <View style={styles.checkingContainer}>
                <ActivityIndicator size="small" color={COLORS.secondary} />
                <Text style={styles.checkingText}>Checking verification status...</Text>
              </View>
            )}
            
            <CustomButton
              title={resendDisabled ? `Resend Email (${countdown}s)` : "Resend Verification Email"}
              handlePress={handleResendVerification}
              containerStyles={`mt-4 ${resendDisabled || verifying ? "opacity-50" : ""}`}
              isLoading={verifying}
            />
            
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  contentContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    height:'60%',
    marginTop: 200,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    color: COLORS.text.secondary,
    marginBottom: 8,
  },
  email: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  instructions: {
    fontSize: 14,
    textAlign: 'center',
    color: COLORS.text.secondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkingText: {
    marginLeft: 8,
    color: COLORS.text.secondary,
    fontSize: 14,
  },
  logoutButton: {
    marginTop: 16,
    padding: 8,
  },
  logoutText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  loader: {
    marginTop: 20
  }
});

export default EmailVerification; 