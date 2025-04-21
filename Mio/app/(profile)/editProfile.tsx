import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  ScrollView, 
  TouchableOpacity, 
  TextInput,
  Platform,
  Dimensions,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { doc, updateDoc, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { COLORS } from '../../constants/Colors';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { uploadImage } from '../../config/cloudinaryConfig';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Toast from 'react-native-toast-message';

// Define interface for function result data
interface DeleteAccountResult {
  success: boolean;
  message?: string;
}

const { width, height } = Dimensions.get('window');
const MAX_BIO_LENGTH = 150;

interface ProfileFormData {
  displayName: string;
  age: string;
  location: string;
  gender: string;
  matchWith: string;
  matchLocation: string;
  relationshipStatus: string;
  bio?: string;
  profilePic: string;
  additionalPics: string[];
  favoriteMovie?: string;
  favoriteBand?: string;
  favoriteAnime?: string;
  favoriteKdrama?: string;
}

export default function EditProfileScreen() {
  const { user, logout, refreshUserState } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profileData, setProfileData] = useState<ProfileFormData>({
    displayName: '',
    age: '',
    location: '',
    gender: 'male',
    matchWith: 'everyone',
    matchLocation: 'local',
    relationshipStatus: 'single',
    bio: '',
    profilePic: '',
    additionalPics: [],
    favoriteMovie: '',
    favoriteBand: '',
    favoriteAnime: '',
    favoriteKdrama: ''
  });
  
  // For profile picture upload
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [additionalPics, setAdditionalPics] = useState<string[]>([]);
  
  // For Delete Account Modal
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false); // Separate loading state for deletion
  
  
  // Fetch current profile data
  useEffect(() => {
    const fetchProfileData = async () => {
      if (!user) return;
      
      try {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists() && userDoc.data().profile) {
          const profile = userDoc.data().profile;
          
          setProfileData({
            displayName: profile.displayName || '',
            age: profile.age || '',
            location: profile.location || '',
            gender: profile.gender || 'male',
            matchWith: profile.matchWith || 'everyone',
            matchLocation: profile.matchLocation || 'local',
            relationshipStatus: profile.relationshipStatus || 'single',
            bio: profile.bio || '',
            profilePic: profile.profilePic || '',
            additionalPics: profile.additionalPics || [],
            favoriteMovie: profile.favoriteMovie || '',
            favoriteBand: profile.favoriteBand || '',
            favoriteAnime: profile.favoriteAnime || '',
            favoriteKdrama: profile.favoriteKdrama || ''
          });
          
          setProfilePicUrl(profile.profilePic);
          setAdditionalPics(profile.additionalPics || []);
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
        Alert.alert('Error', 'Failed to load profile data');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProfileData();
  }, [user]);
  
  // Handle profile picture selection
  const handleSelectProfilePic = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets[0].uri) {
        setIsLoading(true);
        try {
          // Upload image to Cloudinary and get secure URL
          const cloudinaryUrl = await uploadImage(result.assets[0].uri);
          
          // Set the Cloudinary URL in state
          setProfilePicUrl(cloudinaryUrl);
          setProfileData(prev => ({
            ...prev,
            profilePic: cloudinaryUrl
          }));
          
          // Haptic feedback
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Error uploading image:', error);
          Alert.alert('Error', 'Failed to upload image to Cloudinary');
        } finally {
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };
  
  // Handle additional picture selection
  const handleSelectAdditionalPic = async (index: number) => {
    // Only allow adding new photos, not editing existing ones
    if (index < additionalPics.length) {
      return; // Early return if trying to edit an existing photo
    }
    
    if (additionalPics.length >= 3) {
      Alert.alert('Limit Reached', 'You can only add up to 3 additional pictures');
      return;
    }
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets[0].uri) {
        setIsLoading(true);
        try {
          // Upload image to Cloudinary and get secure URL
          const cloudinaryUrl = await uploadImage(result.assets[0].uri);
          
          // Add new pic using Cloudinary URL
          const newPics = [...additionalPics, cloudinaryUrl];
          
          setAdditionalPics(newPics);
          setProfileData(prev => ({
            ...prev,
            additionalPics: newPics
          }));
          
          // Haptic feedback
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Error uploading image:', error);
          Alert.alert('Error', 'Failed to upload image to Cloudinary');
        } finally {
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };
  
  // Handle removing an additional picture
  const handleRemoveAdditionalPic = (index: number) => {
    if (index >= 0 && index < additionalPics.length) {
      const newPics = [...additionalPics];
      newPics.splice(index, 1);
      setAdditionalPics(newPics);
      setProfileData(prev => ({
        ...prev,
        additionalPics: newPics
      }));
      
      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };
  
  // Handle option selection (gender, matchWith, matchLocation, relationshipStatus)
  const handleOptionSelect = (field: string, value: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Haptic feedback
    Haptics.selectionAsync();
  };
  
  // Handle text input changes
  const handleInputChange = (field: string, value: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  // Handle saving profile data
  const handleSaveProfile = async () => {
    if (!user) return;
    
    // Perform validation
    if (!profileData.displayName.trim()) {
      Alert.alert('Error', 'Please enter your display name');
      return;
    }
    
    if (!profileData.age.trim()) {
      Alert.alert('Error', 'Please enter your age');
      return;
    }
    
    if (!profileData.location.trim()) {
      Alert.alert('Error', 'Please enter your location');
      return;
    }
    
    if (!profileData.profilePic) {
      Alert.alert('Error', 'Please select a profile picture');
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Preserve the existing favorite shows when updating
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const existingFavoriteShows = 
        userDoc.exists() && 
        userDoc.data().profile && 
        userDoc.data().profile.favoriteShows
          ? userDoc.data().profile.favoriteShows
          : [];
      
      // Update profile data in Firestore
      await updateDoc(userRef, {
        profile: {
          ...profileData,
          favoriteShows: existingFavoriteShows,
        },
        updatedAt: Timestamp.now(),
        profileCompleted: true
      });
      
      // Navigate back to profile screen
      Alert.alert('Success', 'Profile updated successfully', [
        { 
          text: 'OK', 
          onPress: () => router.back() 
        }
      ]);
      
      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Refresh user state
      await refreshUserState();
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile');
      
      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle delete account confirmation and trigger cloud function
  const handleConfirmDelete = async () => {
    if (!user || deleteConfirmationText !== 'DELETE') return;

    setIsDeleting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      // Call Firebase Function to delete user data and auth account
      const functionsInstance = getFunctions();
      const deleteUserAccount = httpsCallable<any, DeleteAccountResult>(functionsInstance, 'deleteUserAccount');
      const result = await deleteUserAccount();

      if (result.data.success) {
        // Clear sensitive local data if any (optional)
        // await AsyncStorage.removeItem('some_local_key'); 

        // Logout the user locally
        await logout(); // Call logout from useAuth

        // Show success toast
        Toast.show({
          type: 'success',
          text1: 'Account Deleted',
          text2: 'Your account and data have been successfully deleted.',
          position: 'bottom',
          visibilityTime: 4000,
        });

        // Navigate to the root screen after a short delay to allow toast to show
        setTimeout(() => {
          router.replace('/'); // Navigate to index.tsx
        }, 500);

      } else {
        throw new Error(result.data.message || 'Failed to delete account from server.');
      }

    } catch (error: any) {
      console.error('Error deleting user account:', error);
      Alert.alert('Error', error.message || 'Failed to delete account. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsDeleting(false); // Reset loading state only on error, success handles navigation
    } 
    // No finally block to reset isDeleting here, as success navigates away.
  };
  
  
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.loadingText}>Loading profile data...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container} edges={['top']} mode="padding">
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.headerRight}>
          {user?.isAdmin && (
            <TouchableOpacity
              onPress={() => router.push("/(admin)")}
              style={styles.adminButton}
            >
              <Ionicons name="settings" size={22} color={COLORS.secondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Picture */}
        <View style={styles.profilePicSection}>
          <TouchableOpacity 
            style={styles.profilePicContainer}
            onPress={handleSelectProfilePic}
          >
            {profilePicUrl ? (
              <Image 
                source={{ uri: profilePicUrl }} 
                style={styles.profilePic} 
              />
            ) : (
              <View style={styles.profilePicPlaceholder}>
                <Ionicons name="person" size={60} color="#CCC" />
              </View>
            )}
            
          </TouchableOpacity>
          <Text style={styles.profilePicHint}>Tap to change profile picture</Text>
        </View>
        
        {/* Basic Info Form */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Display Name</Text>
            <TextInput
              style={styles.textInput}
              value={profileData.displayName}
              onChangeText={(text) => handleInputChange('displayName', text)}
              placeholder="Your display name"
              placeholderTextColor="#999"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Age</Text>
            <TextInput
              style={styles.textInput}
              value={profileData.age}
              onChangeText={(text) => handleInputChange('age', text)}
              placeholder="Your age"
              placeholderTextColor="#999"
              keyboardType="number-pad"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Location</Text>
            <TextInput
              style={styles.textInput}
              value={profileData.location}
              onChangeText={(text) => handleInputChange('location', text)}
              placeholder="Your location"
              placeholderTextColor="#999"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Bio (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.bioInput]}
              value={profileData.bio || ''}
              onChangeText={(text) => handleInputChange('bio', text.slice(0, MAX_BIO_LENGTH))}
              placeholder="Tell others about yourself..."
              placeholderTextColor="#999"
              multiline
              maxLength={MAX_BIO_LENGTH}
            />
            <Text style={styles.charCounter}>
              {(profileData.bio?.length || 0)}/{MAX_BIO_LENGTH}
            </Text>
          </View>
        </View>
        
        {/* Preference Section */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          
          {/* Gender Selection */}
          <View style={styles.optionContainer}>
            <Text style={styles.optionLabel}>I am</Text>
            <View style={styles.optionButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.gender === 'male' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('gender', 'male')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.gender === 'male' && styles.optionButtonTextSelected
                  ]}
                >
                  Male
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.gender === 'female' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('gender', 'female')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.gender === 'female' && styles.optionButtonTextSelected
                  ]}
                >
                  Female
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Looking For Selection */}
          <View style={styles.optionContainer}>
            <Text style={styles.optionLabel}>Looking for</Text>
            <View style={styles.optionButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.matchWith === 'male' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('matchWith', 'male')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.matchWith === 'male' && styles.optionButtonTextSelected
                  ]}
                >
                  Men
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.matchWith === 'female' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('matchWith', 'female')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.matchWith === 'female' && styles.optionButtonTextSelected
                  ]}
                >
                  Women
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.matchWith === 'everyone' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('matchWith', 'everyone')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.matchWith === 'everyone' && styles.optionButtonTextSelected
                  ]}
                >
                  Everyone
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Match Location Selection */}
          <View style={styles.optionContainer}>
            <Text style={styles.optionLabel}>Match Preference</Text>
            <View style={styles.optionButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.matchLocation === 'local' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('matchLocation', 'local')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.matchLocation === 'local' && styles.optionButtonTextSelected
                  ]}
                >
                  Local
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.matchLocation === 'worldwide' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('matchLocation', 'worldwide')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.matchLocation === 'worldwide' && styles.optionButtonTextSelected
                  ]}
                >
                  Worldwide
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Relationship Status Selection */}
          <View style={styles.optionContainer}>
            <Text style={styles.optionLabel}>Relationship Status</Text>
            <View style={styles.optionButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.relationshipStatus === 'single' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('relationshipStatus', 'single')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.relationshipStatus === 'single' && styles.optionButtonTextSelected
                  ]}
                >
                  Single
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.relationshipStatus === 'in a relationship' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('relationshipStatus', 'in a relationship')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.relationshipStatus === 'in a relationship' && styles.optionButtonTextSelected
                  ]}
                >
                  In a Relationship
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  profileData.relationshipStatus === 'married' && styles.optionButtonSelected
                ]}
                onPress={() => handleOptionSelect('relationshipStatus', 'married')}
              >
                <Text 
                  style={[
                    styles.optionButtonText,
                    profileData.relationshipStatus === 'married' && styles.optionButtonTextSelected
                  ]}
                >
                  Married
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        
        {/* Additional Photos Section */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Additional Photos</Text>
          <Text style={styles.sectionSubtitle}>Add up to 3 photos</Text>
          
          <View style={styles.photoGrid}>
            {/* Map over additionalPics plus one empty slot if < 3 */}
            {[...Array(Math.min(additionalPics.length + 1, 3))].map((_, index) => (
              <View key={index} style={styles.photoItem}>
                {index < additionalPics.length ? (
                  // Existing photo
                  <View style={styles.photoContainer}>
                    <Image 
                      source={{ uri: additionalPics[index] }} 
                      style={styles.additionalPhoto} 
                    />
                    <TouchableOpacity
                      style={styles.photoRemoveButton}
                      onPress={() => handleRemoveAdditionalPic(index)}
                    >
                      <Ionicons name="close" size={16} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  // Add new photo
                  <TouchableOpacity
                    style={styles.addPhotoButton}
                    onPress={() => handleSelectAdditionalPic(index)}
                  >
                    <Ionicons name="add" size={40} color={COLORS.secondary} />
                    <Text style={styles.addPhotoText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </View>
        
        {/* Additional Questions Section */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Additional Information</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Favorite Movie (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={profileData.favoriteMovie || ''}
              onChangeText={(text) => handleInputChange('favoriteMovie', text)}
              placeholder="What's your favorite movie?"
              placeholderTextColor="#999"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Favorite Music (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={profileData.favoriteBand || ''}
              onChangeText={(text) => handleInputChange('favoriteBand', text)}
              placeholder="What's your favorite band or artist?"
              placeholderTextColor="#999"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Favorite Anime (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={profileData.favoriteAnime || ''}
              onChangeText={(text) => handleInputChange('favoriteAnime', text)}
              placeholder="What's your favorite anime?"
              placeholderTextColor="#999"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Favorite K-Drama (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={profileData.favoriteKdrama || ''}
              onChangeText={(text) => handleInputChange('favoriteKdrama', text)}
              placeholder="What's your favorite K-Drama?"
              placeholderTextColor="#999"
            />
          </View>
        </View>
        
        {/* Save Button */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSaveProfile}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#FFF" style={styles.saveButtonIcon} />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Delete Account Button */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => setIsDeleteModalVisible(true)}
          disabled={isSaving || isDeleting}
        >
          <Ionicons name="trash-outline" size={20} color={COLORS.error} style={styles.deleteButtonIcon} />
          <Text style={styles.deleteButtonText}>Delete Account</Text>
        </TouchableOpacity>

        {/* Delete Confirmation Modal */}
        <Modal
          visible={isDeleteModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => !isDeleting && setIsDeleteModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Delete Account?</Text>
              <Text style={styles.modalText}>
                This action is permanent and cannot be undone. All your profile data, matches, and conversations will be deleted.
              </Text>
              <Text style={styles.modalPrompt}>
                To confirm, please type "DELETE" below:
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="DELETE"
                placeholderTextColor="#AAA"
                value={deleteConfirmationText}
                onChangeText={setDeleteConfirmationText}
                autoCapitalize="none"
                editable={!isDeleting}
              />
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setIsDeleteModalVisible(false)}
                  disabled={isDeleting}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.confirmDeleteButton,
                    (deleteConfirmationText !== 'DELETE' || isDeleting) && styles.disabledButton
                  ]}
                  onPress={handleConfirmDelete}
                  disabled={deleteConfirmationText !== 'DELETE' || isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.confirmDeleteButtonText}>Confirm Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  profilePicSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  profilePicContainer: {
    width: width * 0.3,
    height: width * 0.3,
    borderRadius: (width * 0.3) / 2,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  profilePic: {
    width: '100%',
    height: '100%',
  },
  profilePicPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
  },
  
  profilePicHint: {
    marginTop: 12,
    color: COLORS.secondary,
    fontSize: 14,
  },
  formSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    marginBottom: 8,
    backgroundColor: '#FFF',
    borderRadius: 12,
    
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
    marginHorizontal: 16,
    borderWidth: .5,
    borderColor: COLORS.darkestMaroon,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondary,
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: -12,
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: COLORS.darkMaroon,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  bioInput: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  charCounter: {
    alignSelf: 'flex-end',
    marginTop: 4,
    fontSize: 12,
    color: '#888',
  },
  optionContainer: {
    marginBottom: 20,
  },
  optionLabel: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  optionButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: .5,
    borderColor: COLORS.darkMaroon,
  },
  optionButtonSelected: {
    backgroundColor: COLORS.darkMaroon,
  },
  optionButtonText: {
    fontSize: 14,
    color: COLORS.darkestMaroon,
  },
  optionButtonTextSelected: {
    color: '#FFF',
    fontWeight: '500',
  },
  photoGrid: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  photoItem: {
    flex: 1,
    aspectRatio: 1,
    padding: 4,
  },
  photoContainer: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  additionalPhoto: {
    flex: 1,
    resizeMode: 'cover',
  },
  photoRemoveButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 76, 76, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  addPhotoButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  addPhotoText: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.secondary,
  },
  saveButton: {
    backgroundColor: COLORS.darkMaroon,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 40,
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  saveButtonIcon: {
    marginRight: 8,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 40,
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  deleteButtonIcon: {
    marginRight: 8,
  },
  deleteButtonText: {
    color: COLORS.error,
    fontSize: 18,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    width: '80%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondary,
    marginBottom: 16,
  },
  modalText: {
    color: '#333',
    marginBottom: 16,
  },
  modalPrompt: {
    color: '#888',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginHorizontal: 5,
    
  },
  cancelButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: COLORS.error,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: COLORS.error,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmDeleteButton: {
    backgroundColor: COLORS.error,
    borderRadius: 8,
    padding: 10,
    
  },
  confirmDeleteButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  disabledButton: {
    backgroundColor: '#CCC',
  },
  
}); 