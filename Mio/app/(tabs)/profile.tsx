import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text,
  StyleSheet, 
  Image, 
  ScrollView, 
  TouchableOpacity,
  Dimensions,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
  Easing
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { COLORS } from '../../constants/Colors';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import icon from '../../assets/images/icon.png';
import { useFavorites } from '../../context/FavoritesContext';

const { width, height } = Dimensions.get('window');

const MAX_FAVORITES = 10;
const MAX_WEEKLY_REMOVALS = 5;
const COOLDOWN_MINUTES = 5;

type FavoriteType = 'anime' | 'kdrama';

interface ProfileData {
  displayName: string;
  age: number;
  location: string;
  gender: string;
  matchWith: string;
  matchLocation: string;
  relationshipStatus?: string;
  favoriteShows?: string[];
  favoriteMovie?: string;
  favoriteBand?: string;
  favoriteAnime?: string;
  favoriteKdrama?: string;
  profilePic: string;
  additionalPics?: string[];
  lastRemovalTime?: Timestamp;
  weeklyRemovals?: number;
  bio?: string;
}

interface ShowItem {
  id: number;
  title: string;
  posterPath: string;
  overview: string;
  type: 'anime' | 'kdrama';
}

// Loading placeholder for show posters
const PlaceholderImage = ({ type }: { type: 'anime' | 'kdrama' }) => (
  <View style={styles.placeholderContainer}>
    <Image 
      source={icon} 
      style={styles.placeholderImage}
      resizeMode="contain"
    />
    <Text style={styles.placeholderText}>
      {type === 'anime' ? 'No Anime Selected' : 'No K-Drama Selected'}
    </Text>
  </View>
);

// Modal for confirmation and feedback
const FeedbackModal = ({ 
  visible, 
  message, 
  type, 
  onClose 
}: { 
  visible: boolean; 
  message: string; 
  type: 'success' | 'error' | 'warning'; 
  onClose: () => void;
}) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  
  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic)
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);
  
  let iconName: keyof typeof Ionicons.glyphMap = 'checkmark-circle';
  let iconColor = COLORS.secondary;
  
  if (type === 'error') {
    iconName = 'close-circle';
    iconColor = COLORS.darkestMaroon;
  } else if (type === 'warning') {
    iconName = 'alert-circle';
    iconColor = COLORS.darkMaroon;
  }
  
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Ionicons name={iconName} size={50} color={iconColor} />
          <Text style={styles.modalMessage}>{message}</Text>
          <TouchableOpacity style={styles.modalButton} onPress={onClose}>
            <Text style={styles.modalButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { 
    userFavorites, 
    cooldownTimer, 
    removalCount, 
    confirmRemoveFromFavorites,
  
    getTotalFavorites,
    
  } = useFavorites();
  
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [favoriteShows, setFavoriteShows] = useState<{[key: string]: ShowItem}>({});
  const [loading, setLoading] = useState(true);
  const [selectedShow, setSelectedShow] = useState<{ id: string; type: 'anime' | 'kdrama' } | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'error' | 'warning'
  });
  const [profileMetrics, setProfileMetrics] = useState({
    totalFavorites: 0,
    remainingRemovals: MAX_WEEKLY_REMOVALS
  });
  const [forceUpdate, setForceUpdate] = useState(0);
 



  // Fetch user profile on mount and when userFavorites changes
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().profile) {
          const profileData = userDoc.data().profile;
          setProfile(profileData);
          
          // Get latest counts from context
          setProfileMetrics({
            totalFavorites: getTotalFavorites(),
            remainingRemovals: MAX_WEEKLY_REMOVALS - removalCount
          });
          
          // Fetch show details using context favorites
          fetchShowDetails();
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        setFeedbackModal({
          visible: true,
          message: 'Failed to load profile. Please try again.',
          type: 'error'
        });
      } finally {
        setLoading(false);
      }
    };

    // Fetch initial data
    fetchUserProfile();
  }, [user, userFavorites, removalCount, forceUpdate]);

  // Fetch show details from TMDB using context favorites
  const fetchShowDetails = async () => {
    const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
    let shows: {[key: string]: ShowItem} = {};
    
    try {
      // Check if API key is available
      if (!TMDB_API_KEY) {
        throw new Error('TMDB API key is not configured');
      }
      
      // Fetch show details
      if (userFavorites.shows && userFavorites.shows.length > 0) {
        await Promise.all(userFavorites.shows.map(async (id) => {
          try {
            const response = await fetch(
              `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}&language=en-US`
            );
            
            if (!response.ok) {
              throw new Error(`API request failed with status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data && data.name) {
              // Determine if it's anime or kdrama based on genres or origin country
              // This is a simple heuristic - you may want to improve this logic
              const isAnime = data.genres?.some((genre: any) => 
                genre.name.toLowerCase().includes('animation')) || 
                data.origin_country?.includes('JP');
              
              const type: FavoriteType = isAnime ? 'anime' : 'kdrama';
              
              shows[`${id}`] = {
                id: data.id,
                title: data.name,
                posterPath: data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : '',
                overview: data.overview,
                type: type
              };
            }
          } catch (error) {
            console.error(`Error fetching show ${id}:`, error);
            // Continue with other shows even if one fails
          }
        }));
      }
      
      setFavoriteShows(shows);
    } catch (error) {
      console.error('Error fetching show details:', error);
      setFeedbackModal({
        visible: true,
        message: 'Failed to load favorite shows. Please try again.',
        type: 'error'
      });
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: async () => {
          try {
            await logout();
            router.replace("/(auth)/sign-in");
          } catch (error) {
            console.error("Error logging out:", error);
            setFeedbackModal({
              visible: true,
              message: 'Failed to log out. Please try again.',
              type: 'error'
            });
          }
        }}
      ]
    );
  };

  const confirmRemoveShow = (showId: string, showType: 'anime' | 'kdrama') => {
    if (!user || !profile) return;
    
    // Find the show in our favorites
    const show = favoriteShows[showId];
    
    if (!show) {
      console.error('Show not found in favorites');
      return;
    }
    
    // Setup confirmation
    setSelectedShow({ id: showId, type: showType });
    setConfirmModal(true);
    
    // Trigger haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleRemoveShow = async () => {
    if (!user || !profile || !selectedShow) return;
    
    setIsRemoving(true);
    setConfirmModal(false);
    
    try {
      const show = favoriteShows[selectedShow.id];
      
      if (!show) {
        throw new Error('Show not found in favorites');
      }
      
      // Use the context to handle removal
      confirmRemoveFromFavorites(
        show,
        // Success callback
        () => {

          
          // Update local state of favorite shows - will be refreshed on next render
          const newFavoriteShows = { ...favoriteShows };
          delete newFavoriteShows[selectedShow.id];
          setFavoriteShows(newFavoriteShows);
          
          // Update profile metrics from context
          setProfileMetrics({
            totalFavorites: getTotalFavorites() - 1, // Immediate update
            remainingRemovals: MAX_WEEKLY_REMOVALS - (removalCount + 1) // Immediate update
          });
          
          // Force refresh on next render cycle
          setForceUpdate(prev => prev + 1);
          
          // Show success message
          setFeedbackModal({
            visible: true,
            message: 'Show removed from favorites.',
            type: 'success'
          });
        },
        // Error callback
        () => {
          console.error(`Profile: Failed to remove ${show.title} from favorites`);
          setFeedbackModal({
            visible: true,
            message: 'Failed to remove show. Please try again.',
            type: 'error'
          });
        },
        // Cooldown callback
        (cooldownTime) => {
          console.warn(`Profile: Cooldown active (${cooldownTime}s) when trying to remove ${show.title}`);
          const minutes = Math.floor(cooldownTime / 60);
          const seconds = cooldownTime % 60;
          setFeedbackModal({
            visible: true,
            message: `Cooldown active. Please wait ${minutes}:${seconds < 10 ? '0' + seconds : seconds} before removing another show.`,
            type: 'warning'
          });
        }
      );
    } catch (error) {
      console.error("Error removing show:", error);
      setFeedbackModal({
        visible: true,
        message: 'Failed to remove show. Please try again.',
        type: 'error'
      });
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsRemoving(false);
      setSelectedShow(null);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' + secs : secs}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Profile not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const headerImage = (
    <View style={styles.imageContainer}>
      <Image 
        source={{ uri: profile.profilePic }} 
        style={styles.profileImage}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.imageTitleGradient}
      >
        <View style={styles.profileHeader}>
          <Text style={styles.imageTitle}>{profile.displayName}, {profile.age}</Text>
          <Text style={styles.imageSubtitle}>{profile.location}</Text>
          
          {profile.bio && (
            <Text style={styles.bioPreviewer} numberOfLines={2}>
              {profile.bio}
            </Text>
          )}
          
          <View style={styles.profileStats}>
            <View style={styles.profileStat}>
              <Text style={styles.statValue}>{getTotalFavorites()}</Text>
              <Text style={styles.statLabel}>Favorites</Text>
            </View>
            <View style={styles.profileStat}>
              <Text style={styles.statValue}>{MAX_WEEKLY_REMOVALS - removalCount}</Text>
              <Text style={styles.statLabel}>Removals Left</Text>
            </View>
            {cooldownTimer && cooldownTimer > 0 ? (
              <View style={styles.profileStat}>
                <Text style={styles.statValue}>{formatTime(cooldownTimer)}</Text>
                <Text style={styles.statLabel}>Cooldown</Text>
              </View>
            ) : (
              <View style={styles.profileStat}>
                <Text style={styles.statValue}>{MAX_FAVORITES - getTotalFavorites()}</Text>
                <Text style={styles.statLabel}>Slots Left</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <ScrollView 
        style={{ flex: 1, backgroundColor: '#FFF' }}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={{ height: height * 0.55 }}>
          {headerImage}
        </View>
        <View style={styles.content}>
          {/* Basic Info Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="person-circle-outline" size={22} color={COLORS.secondary} />
              <Text style={styles.cardTitle}>About Me</Text>
            </View>
            
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Ionicons name="person" size={20} color={COLORS.secondary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>Gender</Text>
                  <Text style={styles.infoValue}>
                    {profile.gender === 'male' ? 'Male' : 'Female'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.infoItem}>
                <Ionicons name="heart" size={20} color={COLORS.secondary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>Looking for</Text>
                  <Text style={styles.infoValue}>
                    {profile.matchWith === 'male' ? 'Men' : 
                     profile.matchWith === 'female' ? 'Women' : 'Everyone'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.infoItem}>
                <Ionicons name="locate" size={20} color={COLORS.secondary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>Match Preference</Text>
                  <Text style={styles.infoValue}>
                    {profile.matchLocation === 'local' ? 'Local' : 'Worldwide'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.infoItem}>
                <Ionicons name="heart-circle-outline" size={20} color={COLORS.secondary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>Relationship Status</Text>
                  <Text style={styles.infoValue}>{profile.relationshipStatus || 'Not specified'}</Text>
                </View>
              </View>
            </View>
          </View>
          
          {/* Removal Quota Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="timer-outline" size={22} color={COLORS.secondary} />
              <Text style={styles.cardTitle}>Removal Limits</Text>
            </View>
            
            <View style={styles.removalInfo}>
              <View style={styles.quotaContainer}>
                <View style={styles.quotaTextContainer}>
                  <Text style={styles.quotaTitle}>Removal Count</Text>
                  <Text style={styles.quotaValue}>
                    {removalCount}/{MAX_WEEKLY_REMOVALS}
                  </Text>
                </View>
                
                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBackground}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${((removalCount) / MAX_WEEKLY_REMOVALS) * 100}%`,
                          backgroundColor: removalCount && removalCount >= MAX_WEEKLY_REMOVALS 
                            ? '#FF6B6B' 
                            : COLORS.secondary
                        }
                      ]}
                    />
                  </View>
                </View>
              </View>
              
              {cooldownTimer && cooldownTimer > 0 && (
                <View style={styles.cooldownContainer}>
                  <View style={styles.cooldownIconContainer}>
                    <Ionicons name="hourglass-outline" size={20} color="#FF6B6B" />
                  </View>
                  <View style={styles.cooldownTextContainer}>
                    <Text style={styles.cooldownLabel}>Cooldown Period</Text>
                    <Text style={styles.cooldownValue}>
                      {formatTime(cooldownTimer)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Favorite Shows Grid */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="heart-circle-outline" size={22} color={COLORS.secondary} />
              <Text style={styles.cardTitle}>My Favorites</Text>
              <Text style={styles.favoritesCount}>
                {getTotalFavorites()}/{MAX_FAVORITES}
              </Text>
            </View>
            
            {favoriteShows && Object.keys(favoriteShows).length > 0 ? (
              <View style={styles.favoritesGrid}>
                {Object.keys(favoriteShows).map(key => {
                  const show = favoriteShows[key];
                  
                  return (
                    <View key={key} style={styles.favoriteItem}>
                      <TouchableOpacity
                        style={styles.favoriteCard}
                        onPress={() => router.push({
                          pathname: "/(common)/seriesDetails",
                          params: { id: show.id, type: show.type }
                        })}
                        activeOpacity={0.7}
                      >
                        {show.posterPath ? (
                          <Image 
                            source={{ uri: show.posterPath }} 
                            style={styles.favoriteImage}
                          />
                        ) : (
                          <PlaceholderImage type={show.type} />
                        )}
                        
                        <View style={styles.favoriteType}>
                          <Text style={styles.favoriteTypeText}>
                            {show.type === 'anime' ? 'Anime' : 'K-Drama'}
                          </Text>
                        </View>
                        
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => confirmRemoveShow(key, show.type)}
                          disabled={isRemoving}
                        >
                          <Ionicons name="close-circle" size={24} color="#FFF" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                      
                      <Text style={styles.favoriteTitle} numberOfLines={1}>
                        {show.title}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyFavorites}>
                <Ionicons name="heart-dislike-outline" size={40} color={COLORS.secondary} opacity={0.5} />
                <Text style={styles.emptyFavoritesText}>
                  You haven't added any favorites yet
                </Text>
                <Text style={styles.emptyFavoritesSubtext}>
                  Discover shows in the Home tab
                </Text>
              </View>
            )}
          </View>
          
          {/* Other Favorites Card */}
          {(profile.favoriteMovie || profile.favoriteBand || profile.favoriteAnime || profile.favoriteKdrama) && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="star-outline" size={22} color={COLORS.secondary} />
                <Text style={styles.cardTitle}>Other Interests</Text>
              </View>
              
              <View style={styles.interestsContainer}>
                {profile.favoriteMovie && (
                  <View style={styles.interestItem}>
                    <MaterialCommunityIcons name="movie-open-outline" size={24} color={COLORS.secondary} />
                    <View style={styles.interestContent}>
                      <Text style={styles.interestLabel}>Favorite Movie</Text>
                      <Text style={styles.interestValue}>{profile.favoriteMovie}</Text>
                    </View>
                  </View>
                )}
                
                {profile.favoriteBand && (
                  <View style={styles.interestItem}>
                    <Ionicons name="musical-notes-outline" size={24} color={COLORS.secondary} />
                    <View style={styles.interestContent}>
                      <Text style={styles.interestLabel}>Favorite Music</Text>
                      <Text style={styles.interestValue}>{profile.favoriteBand}</Text>
                    </View>
                  </View>
                )}
                
                {profile.favoriteAnime && (
                  <View style={styles.interestItem}>
                    <Ionicons name="tv-outline" size={24} color={COLORS.secondary} />
                    <View style={styles.interestContent}>
                      <Text style={styles.interestLabel}>Favorite Anime</Text>
                      <Text style={styles.interestValue}>{profile.favoriteAnime}</Text>
                    </View>
                  </View>
                )}
                
                {profile.favoriteKdrama && (
                  <View style={styles.interestItem}>
                    <Ionicons name="tv-outline" size={24} color={COLORS.secondary} />
                    <View style={styles.interestContent}>
                      <Text style={styles.interestLabel}>Favorite K-Drama</Text>
                      <Text style={styles.interestValue}>{profile.favoriteKdrama}</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}
          
          {/* Photos Gallery */}
          {profile.additionalPics && profile.additionalPics.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="images-outline" size={22} color={COLORS.secondary} />
                <Text style={styles.cardTitle}>My Photos</Text>
              </View>
              
              <ScrollView 
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photosContainer}
              >
                {profile.additionalPics.map((photo, index) => (
                  <View key={index} style={styles.photoWrapper}>
                    <Image source={{ uri: photo }} style={styles.additionalPhoto} />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          
          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push('/(profile)/editProfile')}
            >
              <Ionicons name="create-outline" size={22} color="#FFF" />
              <Text style={styles.actionButtonText}>Edit Profile</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.logoutButton]}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={22} color="#FFF" />
              <Text style={styles.actionButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      
      {/* Confirmation Modal */}
      <Modal
        visible={confirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Ionicons name="alert-circle-outline" size={60} color={COLORS.darkMaroon} />
            <Text style={styles.confirmTitle}>Remove Favorite?</Text>
            <Text style={styles.confirmMessage}>
              {removalCount === MAX_WEEKLY_REMOVALS - 1 
                ? `This will be your last removal before the ${COOLDOWN_MINUTES}-minute cooldown starts.`
                : `You have used ${removalCount} out of ${MAX_WEEKLY_REMOVALS} removals.`
              }
              {cooldownTimer === null && removalCount === MAX_WEEKLY_REMOVALS - 1 && 
                ` After ${MAX_WEEKLY_REMOVALS} removals, you'll need to wait ${COOLDOWN_MINUTES} minutes before removing more.`
              }
            </Text>
            
            <View style={styles.confirmButtons}>
              <TouchableOpacity 
                style={[styles.confirmButton, styles.cancelButton]} 
                onPress={() => {
                  setConfirmModal(false);
                  setSelectedShow(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.confirmButton, styles.removeConfirmButton]}
                onPress={handleRemoveShow}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.removeConfirmButtonText}>Remove</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Feedback Modal */}
      <FeedbackModal
        visible={feedbackModal.visible}
        message={feedbackModal.message}
        type={feedbackModal.type}
        onClose={() => setFeedbackModal(prev => ({ ...prev, visible: false }))}
      />
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
    backgroundColor: '#FFF',
  },
  loadingText: {
    fontSize: 18,
    color: COLORS.secondary,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.secondary,
  },
  imageContainer: {
    width: '100%',
    height: height * 0.55,
    position: 'relative',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageTitleGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  profileHeader: {
    width: '100%',
  },
  imageTitle: {
    color: '#FFF',
    fontSize: 30,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  imageSubtitle: {
    color: '#FFF',
    fontSize: 18,
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bioPreviewer: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    marginTop: 8,
    lineHeight: 22,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  profileStats: {
    flexDirection: 'row',
    marginTop: 16,
  },
  profileStat: {
    alignItems: 'center',
    marginRight: 24,
  },
  statValue: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 16,
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
    borderWidth: 0.5,
    borderColor: COLORS.darkestMaroon,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondary,
    marginLeft: 8,
    flex: 1,
  },
  favoritesCount: {
    fontSize: 16,
    color: COLORS.secondary,
    fontWeight: '600',
  },
  infoGrid: {
    padding: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  infoTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#888',
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginTop: 2,
  },
  removalInfo: {
    padding: 16,
  },
  quotaContainer: {
    marginBottom: 16,
  },
  quotaTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quotaTitle: {
    fontSize: 16,
    color: '#333',
  },
  quotaValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  progressBarContainer: {
    height: 8,
    width: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBackground: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.secondary,
    borderRadius: 4,
  },
  cooldownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8F8',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  cooldownIconContainer: {
    width: 36,
    height: 36,
    backgroundColor: '#FFE0E0',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cooldownTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  cooldownLabel: {
    fontSize: 14,
    color: '#FF6B6B',
  },
  cooldownValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF6B6B',
    marginTop: 2,
  },
  loadingFavorites: {
    padding: 20,
    alignItems: 'center',
  },
  loadingFavoritesText: {
    marginTop: 8,
    fontSize: 14,
    color: '#888',
  },
  favoritesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 16,
  },
  favoriteItem: {
    width: '33.33%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  favoriteCard: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  favoriteImage: {
    width: '100%',
    aspectRatio: 2/3,
    backgroundColor: '#F0F0F0',
  },
  placeholderContainer: {
    width: '100%',
    aspectRatio: 2/3,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderImage: {
    width: '100%',
    aspectRatio: 2/3,
    backgroundColor: '#F0F0F0',
    resizeMode: 'contain',
  },
  placeholderText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.secondary,
  },
  favoriteType: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  favoriteTypeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '500',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    backgroundColor: COLORS.darkestMaroon,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyFavorites: {
    padding: 30,
    alignItems: 'center',
  },
  emptyFavoritesText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#555',
    textAlign: 'center',
  },
  emptyFavoritesSubtext: {
    marginTop: 6,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  interestsContainer: {
    padding: 16,
  },
  interestItem: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: COLORS.tertiary,
    padding: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.secondary,
  },
  interestContent: {
    marginLeft: 12,
    flex: 1,
  },
  interestLabel: {
    fontSize: 14,
    color: '#888',
  },
  interestValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginTop: 2,
  },
  photosContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  photoWrapper: {
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  additionalPhoto: {
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    backgroundColor: COLORS.maroon,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  logoutButton: {
    backgroundColor: '#a60c0c',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    width: width * 0.8,
    padding: 24,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: COLORS.darkestMaroon,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.darkMaroon,
    marginTop: 12,
  },
  confirmMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  confirmButtons: {
    flexDirection: 'row',
    width: '100%',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F0F0F0',
    marginRight: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.darkMaroon,
  },
  removeConfirmButton: {
    backgroundColor: COLORS.darkestMaroon,
    marginLeft: 8,
  },
  removeConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    width: width * 0.8,
    padding: 24,
    alignItems: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: COLORS.secondary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});