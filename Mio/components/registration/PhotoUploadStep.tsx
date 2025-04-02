import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Image,
  Alert,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRegistration } from '../../context/RegistrationContext';
import { uploadImage } from '../../config/cloudinaryConfig';
import { COLORS } from '../../constants/Colors';

// This component uploads images to Cloudinary and stores the Cloudinary URLs
const PhotoUploadStep = () => {
  const { registrationData, updateField, nextStep, prevStep } = useRegistration();
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [imageUri, setImageUri] = useState('');

  const pickImage = async () => {
    setIsUploading(true);
    try {
      // No permissions request needed for picking images from the library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        // Upload to Cloudinary
        const cloudinaryUrl = await uploadImage(result.assets[0].uri);
        setImageUri(result.assets[0].uri);
        updateField('profilePic', cloudinaryUrl);
        setError('');
      }
    } catch (error) {
      Alert.alert(
        "Upload Failed",
        "Failed to upload your photo. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
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
        <TouchableOpacity onPress={pickImage} style={styles.profilePicContainer}>
          <Image source={{ uri: registrationData.profilePic }} style={styles.profilePic} />
          <View style={styles.editIconContainer}>
            <Ionicons name="pencil" size={20} color="white" />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity 
        onPress={pickImage} 
        style={styles.addProfilePicButton}
        disabled={isUploading}
      >
        {isUploading ? (
          <ActivityIndicator size="large" color={COLORS.darkMaroon} />
        ) : (
          <>
            <Ionicons name="add" size={40} color={COLORS.darkMaroon} />
            <Text style={styles.addProfileText}>Add Profile Picture</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <StatusBar backgroundColor="white" barStyle="dark-content" />
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
              onPress={() => pickImage()}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={COLORS.darkMaroon} />
              ) : (
                <Ionicons name="add" size={30} color={COLORS.darkMaroon} />
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
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.darkestMaroon,
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
    color: COLORS.darkMaroon,
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
    backgroundColor: COLORS.darkestMaroon,
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
    borderColor: COLORS.darkMaroon,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    backgroundColor: 'white',
  },
  addProfileText: {
    color: COLORS.maroon,
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
    borderColor: COLORS.darkMaroon,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  backButton: {
    flex: 1,
    backgroundColor: COLORS.maroon,
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.darkestMaroon,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    backgroundColor: COLORS.darkestMaroon,
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