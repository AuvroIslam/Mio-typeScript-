import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/Colors';

export default function AdminPanel() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <View style={styles.headerRight} />
      </View>
      
      {/* Admin menu items */}
      <View style={styles.content}>
        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push("/(admin)/trending")}
        >
          <View style={styles.menuIconContainer}>
            <Ionicons name="trending-up" size={24} color={COLORS.secondary} />
          </View>
          <View style={styles.menuTextContainer}>
            <Text style={styles.menuTitle}>Manage Trending Shows</Text>
            <Text style={styles.menuDescription}>
              Add, remove or update trending shows that appear on the home screen
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#888" />
        </TouchableOpacity>
        
        {/* Add more admin functions here as needed */}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    marginBottom: 12,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 14,
    color: '#777',
  },
}); 