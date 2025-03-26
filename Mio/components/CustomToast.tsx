import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BaseToast, ErrorToast, ToastConfig } from 'react-native-toast-message';

export const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: '#8174A0',
        backgroundColor: '#F2F9FF',
        width: '90%',
        borderRadius: 8,
      }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: '600',
        color: '#8174A0',
      }}
      text2Style={{
        fontSize: 14,
        color: '#666',
      }}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={{
        borderLeftColor: '#FF6B6B',
        backgroundColor: '#F2F9FF',
        width: '90%',
        borderRadius: 8,
      }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: '600',
        color: '#FF6B6B',
      }}
      text2Style={{
        fontSize: 14,
        color: '#666',
      }}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: '#5DADE2',
        backgroundColor: '#F2F9FF',
        width: '90%',
        borderRadius: 8,
      }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: '600',
        color: '#5DADE2',
      }}
      text2Style={{
        fontSize: 14,
        color: '#666',
      }}
    />
  ),
  warning: (props) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: '#F4D03F',
        backgroundColor: '#F2F9FF',
        width: '90%',
        borderRadius: 8,
      }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: '600',
        color: '#F4D03F',
      }}
      text2Style={{
        fontSize: 14,
        color: '#666',
      }}
    />
  ),
}; 