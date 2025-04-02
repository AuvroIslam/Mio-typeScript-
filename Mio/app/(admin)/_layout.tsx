import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Loader } from '../../components';

export default function AdminLayout() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // If user is not admin, redirect to home
    if (!isLoading && (!user || !user.isAdmin)) {
      router.replace('/(tabs)/home');
    }
  }, [user, isLoading]);

  if (isLoading) {
    return <Loader isLoading={true} />;
  }

  // Protect all admin routes
  if (!user?.isAdmin) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: "Admin Panel",
        }}
      />
      <Stack.Screen
        name="trending"
        options={{
          title: "Manage Trending Shows",
        }}
      />
    </Stack>
  );
} 