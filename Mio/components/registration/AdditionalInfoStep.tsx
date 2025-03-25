import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { InputField } from '../index';
import { useRegistration } from '../../context/RegistrationContext';
import { useAuth } from '../../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';

const AdditionalInfoStep = () => {
  const router = useRouter();
  const { registrationData, updateField, prevStep } = useRegistration();
  const { user, setUserHasProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // No validation errors needed since all fields are optional
  const [errors, setErrors] = useState({
    favoriteShow: '',
    favoriteMovie: '',
    favoriteBand: '',
    favoriteAnime: '',
    favoriteKdrama: '',
  });

  // No validation needed since all fields are optional
  const validateForm = () => {
    return true;
  };

  const handleSubmit = async () => {
    // No validation needed
    setIsSubmitting(true);
    
    try {
      if (user) {
        // Save profile data to Firestore
        // Note: For image fields, we're only storing the URLs from Cloudinary
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          profile: {
            displayName: registrationData.displayName,
            age: registrationData.age,
            gender: registrationData.gender,
            location: registrationData.location,
            matchWith: registrationData.matchWith,
            matchLocation: registrationData.matchLocation,
            relationshipStatus: registrationData.relationshipStatus,
            // These are Cloudinary URLs, not local URIs
            profilePic: registrationData.profilePic,
            additionalPics: registrationData.additionalPics,
            // These fields are all optional
            favoriteShows: [],  // Initialize empty array for favorite shows
            favoriteMovie: registrationData.favoriteMovie || '',
            favoriteBand: registrationData.favoriteBand || '',
            favoriteAnime: registrationData.favoriteAnime || '',
            favoriteKdrama: registrationData.favoriteKdrama || '',
          },
          profileCompleted: true,
          updatedAt: new Date(),
        });

        // Update user state to reflect profile completion
        setUserHasProfile(true);
        
        // Navigate to home
        router.replace("/(tabs)/home");
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Almost Done!</Text>
      <Text style={styles.subtitle}>Tell us about your interests (optional)</Text>

      <View style={styles.sectionTitle}>
        <Text style={styles.label}>Relationship Status</Text>
      </View>
      <View style={styles.optionsContainer}>
        <TouchableOpacity
          style={[
            styles.option,
            registrationData.relationshipStatus === 'single' && styles.selectedOption,
          ]}
          onPress={() => updateField('relationshipStatus', 'single')}
        >
          <Text
            style={[
              styles.optionText,
              registrationData.relationshipStatus === 'single' && styles.selectedOptionText,
            ]}
          >
            Single
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.option,
            registrationData.relationshipStatus === 'in a relationship' && styles.selectedOption,
          ]}
          onPress={() => updateField('relationshipStatus', 'in a relationship')}
        >
          <Text
            style={[
              styles.optionText,
              registrationData.relationshipStatus === 'in a relationship' && styles.selectedOptionText,
            ]}
          >
            In a Relationship
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.option,
            registrationData.relationshipStatus === 'married' && styles.selectedOption,
          ]}
          onPress={() => updateField('relationshipStatus', 'married')}
        >
          <Text
            style={[
              styles.optionText,
              registrationData.relationshipStatus === 'married' && styles.selectedOptionText,
            ]}
          >
            Married
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formSection}>
        <InputField
          label="What is your favorite anime? (optional)"
          value={registrationData.favoriteAnime}
          onChangeText={(text) => updateField('favoriteAnime', text)}
          placeholder="Share your favorite anime"
          error={errors.favoriteAnime}
        />

        <InputField
          label="What is your favorite K-drama? (optional)"
          value={registrationData.favoriteKdrama}
          onChangeText={(text) => updateField('favoriteKdrama', text)}
          placeholder="Share your favorite K-drama"
          error={errors.favoriteKdrama}
        />

        <InputField
          label="What is your favorite movie? (optional)"
          value={registrationData.favoriteMovie}
          onChangeText={(text) => updateField('favoriteMovie', text)}
          placeholder="Your favorite movie"
          error={errors.favoriteMovie}
        />

        <InputField
          label="What is your favorite band/music? (optional)"
          value={registrationData.favoriteBand}
          onChangeText={(text) => updateField('favoriteBand', text)}
          placeholder="Your music preference"
          error={errors.favoriteBand}
        />
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.backButton} onPress={prevStep}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.submitButton, isSubmitting && styles.disabledButton]} 
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <Text style={styles.submitButtonText}>Saving...</Text>
          ) : (
            <Text style={styles.submitButtonText}>Complete Profile</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8174A0',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 8,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#8174A0',
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  option: {
    borderWidth: 1,
    borderColor: '#FFCCE1',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginRight: 10,
    marginBottom: 10,
    backgroundColor: '#FFF5D7',
  },
  selectedOption: {
    backgroundColor: '#8174A0',
    borderColor: '#8174A0',
  },
  optionText: {
    color: '#8174A0',
  },
  selectedOptionText: {
    color: '#FFF',
  },
  formSection: {
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#FFF5D7',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#FFCCE1',
  },
  backButtonText: {
    color: '#8174A0',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    backgroundColor: '#8174A0',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginLeft: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AdditionalInfoStep; 