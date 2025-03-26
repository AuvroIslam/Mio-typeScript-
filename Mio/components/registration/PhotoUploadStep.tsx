import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Image,
  Alert,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRegistration } from '../../context/RegistrationContext';
import { uploadImage } from '../../config/cloudinaryConfig';

// This component uploads images to Cloudinary and stores the Cloudinary URLs
const PhotoUploadStep = () => {
  const { registrationData, updateField, nextStep, prevStep } = useRegistration();
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const pickImage = async (isProfile = false) => {
    try {
      console.log('Opening image picker...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8, // Reduced quality to keep file sizes smaller
      });

      console.log('Image picker result:', result.canceled ? 'Canceled' : 'Image selected');
      
      if (!result.canceled) {
        setIsUploading(true);
        try {
          console.log('Selected image URI:', result.assets[0].uri);
          // Upload to Cloudinary and get URL
          const cloudinaryUrl = await uploadImage(result.assets[0].uri);
          console.log('Cloudinary upload successful:', cloudinaryUrl);
          
          if (isProfile) {
            // Store Cloudinary URL of the profile picture
            updateField('profilePic', cloudinaryUrl);
            setError('');
          } else {
            if (registrationData.additionalPics.length < 3) {
              // Store Cloudinary URLs of additional pictures
              updateField('additionalPics', [
                ...registrationData.additionalPics,
                cloudinaryUrl,
              ]);
            } else {
              Alert.alert('Maximum Photos', 'You can only upload up to 3 additional photos.');
            }
          }
        } catch (error) {
          console.error('Error uploading to Cloudinary:', error);
          Alert.alert('Upload Error', 'Failed to upload image to Cloudinary. Please try again.');
        } finally {
          setIsUploading(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
      setIsUploading(false);
    }
  };

  const removeAdditionalPic = (index: number) => {
    const newPics = [...registrationData.additionalPics];
    newPics.splice(index, 1);
    updateField('additionalPics', newPics);
  };

  const handleNext = () => {
    if (!registrationData.profilePic) {
      setError('Profile picture is required');
      return;
    }
    
    nextStep();
  };

  const renderProfilePicture = () => {
    if (registrationData.profilePic) {
      return (
        <TouchableOpacity onPress={() => pickImage(true)} style={styles.profilePicContainer}>
          <Image source={{ uri: registrationData.profilePic }} style={styles.profilePic} />
          <View style={styles.editIconContainer}>
            <Ionicons name="pencil" size={20} color="white" />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity 
        onPress={() => pickImage(true)} 
        style={styles.addProfilePicButton}
        disabled={isUploading}
      >
        {isUploading ? (
          <ActivityIndicator size="large" color="#8174A0" />
        ) : (
          <>
            <Ionicons name="add" size={40} color="#8174A0" />
            <Text style={styles.addProfileText}>Add Profile Picture</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Upload Your Photos</Text>
      <Text style={styles.subtitle}>Add photos to complete your profile</Text>

      <View style={styles.sectionTitle}>
        <Text style={styles.label}>Profile Picture (Required)</Text>
      </View>
      
      {renderProfilePicture()}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.sectionTitle}>
        <Text style={styles.label}>Additional Photos (Optional)</Text>
        <Text style={styles.subLabel}>Add up to 3 more photos to showcase your personality</Text>
      </View>

      <View style={styles.additionalPicsContainer}>
        {registrationData.additionalPics.map((pic, index) => (
          <View key={index} style={styles.additionalPicItem}>
            <Image source={{ uri: pic }} style={styles.additionalPic} />
            <TouchableOpacity 
              style={styles.removeIconContainer} 
              onPress={() => removeAdditionalPic(index)}
            >
              <Ionicons name="close-circle" size={24} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        ))}

        {registrationData.additionalPics.length < 3 && (
          <TouchableOpacity 
            style={styles.addAdditionalPicButton}
            onPress={() => pickImage(false)}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#8174A0" />
            ) : (
              <Ionicons name="add" size={30} color="#8174A0" />
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={prevStep}
          disabled={isUploading}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.nextButton, isUploading && styles.disabledButton]} 
          onPress={handleNext}
          disabled={isUploading}
        >
          <Text style={styles.nextButtonText}>Continue</Text>
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
    marginBottom: 16,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#8174A0',
  },
  subLabel: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  profilePicContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignSelf: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  profilePic: {
    width: '100%',
    height: '100%',
    borderRadius: 75,
  },
  editIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#8174A0',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  addProfilePicButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: '#FFCCE1',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    backgroundColor: '#F2F9FF',
  },
  addProfileText: {
    color: '#8174A0',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 16,
  },
  additionalPicsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  additionalPicItem: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 10,
    marginBottom: 10,
    position: 'relative',
  },
  additionalPic: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removeIconContainer: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  addAdditionalPicButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFCCE1',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F9FF',
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
  nextButton: {
    flex: 1,
    backgroundColor: '#8174A0',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginLeft: 8,
  },
  nextButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default PhotoUploadStep; 