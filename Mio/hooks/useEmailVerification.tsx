import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { reload } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import Toast from 'react-native-toast-message';

/**
 * Custom hook to handle email verification functionality and auto-redirection
 * @param redirectOnVerify - The path to redirect to when email is verified
 * @param checkInterval - How often to check verification status (in ms)
 */
export const useEmailVerification = (
  redirectOnVerify: '/(registration)/registration' = '/(registration)/registration',
  checkInterval = 1000
) => {
  const router = useRouter();
  const { user, sendVerification, refreshUserState } = useAuth();
  const [verifying, setVerifying] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [verified, setVerified] = useState(false);

  // Handle countdown timer for resend button
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setResendDisabled(false);
    }
  }, [countdown]);

  // Handle redirection after verification is confirmed
  useEffect(() => {
    if (verified) {

      
      // Attempt immediate redirection
      router.replace(redirectOnVerify as any);
      
      // Also set a fallback timer in case the first attempt fails
      const redirectTimer = setTimeout(() => {
        router.replace(redirectOnVerify as any);
      }, 800);
      
      return () => clearTimeout(redirectTimer);
    }
  }, [verified, router, redirectOnVerify]);

  // Check verification status periodically
  useEffect(() => {
    if (!user) return;
    
    // Don't keep checking if already verified
    if (verified || user.emailVerified) {
      if (user.emailVerified && !verified) {
        setVerified(true);
      }
      return;
    }

    const checkVerificationStatus = async () => {
      if (auth.currentUser && !auth.currentUser.emailVerified) {
        setIsCheckingStatus(true);
        try {
          // Reload user to get current verification status
          await reload(auth.currentUser);
          
          // Refresh the user state in AuthContext
          await refreshUserState();
          
          if (auth.currentUser.emailVerified) {
          
            Toast.show({
              type: 'success',
              text1: 'Email Verified!',
              text2: 'Your email has been verified successfully.',
              position: 'bottom'
            });
            
            // Mark as verified, which will trigger the redirection effect
            setVerified(true);
          }
        } catch (error) {
          console.error('Error checking verification status:', error);
        } finally {
          setIsCheckingStatus(false);
        }
      }
    };

    // Check immediately and then set interval
    checkVerificationStatus();
    const intervalId = setInterval(checkVerificationStatus, checkInterval);
    
    return () => clearInterval(intervalId);
  }, [user, verified, checkInterval, refreshUserState]);

  // Handle resend verification email
  const handleResendVerification = useCallback(async () => {
    if (resendDisabled) return;
    
    setVerifying(true);
    try {
      await sendVerification();
      Toast.show({
        type: 'success',
        text1: 'Verification Email Sent',
        text2: 'Please check your inbox or spam folder',
        position: 'bottom'
      });
      
      // Disable resend button for 60 seconds
      setResendDisabled(true);
      setCountdown(60);
    } catch (error) {
      let errorMessage = 'Failed to send verification email. Please try again later.';
      
      // @ts-ignore
      if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please try again later.';
      }
      
      Toast.show({
        type: 'error',
        text1: 'Email Verification Failed',
        text2: errorMessage,
        position: 'bottom'
      });
    } finally {
      setVerifying(false);
    }
  }, [sendVerification, resendDisabled]);

  return {
    isCheckingStatus,
    verifying,
    resendDisabled,
    countdown,
    handleResendVerification,
    verified
  };
}; 