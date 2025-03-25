import React from 'react';
import { Text, View } from 'react-native';

export default function ExampleComponent() {
  return (
    <View className="flex-1 items-center justify-center bg-white p-4">
      <View className="bg-blue-500 p-4 rounded-lg shadow-lg">
        <Text className="text-white text-xl font-bold">Welcome to Mio App!</Text>
        <Text className="text-white mt-2">This component is styled with Tailwind CSS</Text>
      </View>
    </View>
  );
} 