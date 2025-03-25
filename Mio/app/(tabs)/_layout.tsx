import { View, Text, Image } from 'react-native'
import React from 'react'
import { Tabs } from 'expo-router'
import { ImageSourcePropType } from 'react-native'

// Import from constants
import { icons } from '../../constants'

interface TabIconProps {
  icon: ImageSourcePropType;
  color: string;
  name: string;
  focused: boolean;
}

const TabIcon = ({ icon, color, name, focused }: TabIconProps) => {
  return (
    <View className={`items-center justify-center ${focused ? 'opacity-100' : 'opacity-70'}`} style={{ minWidth: 60 }}>
      <View style={{ height: 24, width: 24, alignItems: 'center', justifyContent: 'center' }}>
        <Image 
          source={icon}
          style={{ 
            width: 20, 
            height: 20, 
            tintColor: color 
          }}
          resizeMode="contain"
        />
      </View>
      <Text 
        numberOfLines={1} 
        className={`text-xs ${focused ? 'font-poppins-bold' : 'font-poppins-medium'}`} 
        style={{ color:color, marginTop: 2 }}
      >
        {name}
      </Text>
    </View>
  )
}

const TabsLayout = () => {
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarShowLabel: false,
        tabBarStyle: {
          paddingTop: 2,
          height: 40,
          
        }
      }}
    >
      <Tabs.Screen name="home" options={{
        title: 'Home',
        headerShown: false,
        tabBarIcon: ({ color, focused }) => (
          <TabIcon icon={icons.home} color={color} name="Home" focused={focused} />
        )
      }} />
      <Tabs.Screen name="match" options={{
        title: 'Match',
        headerShown: false,
        tabBarIcon: ({ color, focused }) => (
          <TabIcon icon={icons.matched} color={color} name="Match" focused={focused} />
        )
      }} />
      <Tabs.Screen name="inbox" options={{
        title: 'Inbox',
        headerShown: false,
        tabBarIcon: ({ color, focused }) => (
          <TabIcon icon={icons.inbox} color={color} name="Inbox" focused={focused} />
        )
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'Profile',
        headerShown: false,
        tabBarIcon: ({ color, focused }) => (
          <TabIcon icon={icons.profile} color={color} name="Profile" focused={focused} />
        )
      }} />
    </Tabs>
  )
}

export default TabsLayout