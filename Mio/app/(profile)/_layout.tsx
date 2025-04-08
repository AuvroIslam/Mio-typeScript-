import { Stack } from 'expo-router';
import { useTheme } from '@react-navigation/native';
import { COLORS } from '../../constants/Colors';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FFF' },
        animation: 'slide_from_right',
      }}
    />
  );
} 