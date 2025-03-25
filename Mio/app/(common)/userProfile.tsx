import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  ScrollView, 
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
  StatusBar
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/Colors';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { MatchLevel } from '../../context/MatchContext';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';

interface ProfileData {
  displayName: string;
  age: number;
  location: string;
  gender: string;
  profilePic: string;
  bio?: string;
  relationshipStatus?: string;
  favoriteShows?: string[];
  favoriteMovie?: string;
  favoriteBand?: string;
  favoriteAnime?: string;
  favoriteKdrama?: string;
}

interface CommonShow {
  id: string;
  title: string;
  posterPath: string;
  type: 'anime' | 'kdrama';
}

export default function UserProfileScreen() {
  const params = useLocalSearchParams();
  const userId = params.userId as string;
  const matchLevel = params.matchLevel as MatchLevel;
  const commonShowIds = params.commonShows ? (params.commonShows as string).split(',') : [];
  
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [commonShows, setCommonShows] = useState<CommonShow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (userId) {
      fetchUserProfile();
      fetchCommonShows();
    }
  }, [userId]);
  
  const fetchUserProfile = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists() && userDoc.data().profile) {
        const profileData = userDoc.data().profile;
        setProfile(profileData);
      } else {
        setError('User profile not found');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setError('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };
  
  const fetchCommonShows = async () => {
    if (!commonShowIds.length) return;
    
    try {
      const TMDB_API_KEY = 'b2b68cd65cf02c8da091b2857084bd4d'; 
      const shows: CommonShow[] = [];
      
      for (const showId of commonShowIds) {
        const response = await fetch(
          `https://api.themoviedb.org/3/tv/${showId}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        
        if (response.ok) {
          const data = await response.json();
          
          // Determine show type (anime or kdrama)
          const isAnime = data.genres?.some((genre: any) => 
            genre.name.toLowerCase().includes('animation')
          ) || data.origin_country?.includes('JP');
          
          shows.push({
            id: showId,
            title: data.name,
            posterPath: data.poster_path,
            type: isAnime ? 'anime' : 'kdrama'
          });
        }
      }
      
      setCommonShows(shows);
    } catch (error) {
      console.error('Error fetching common shows:', error);
    }
  };
  
  const getMatchLevelStyle = (level: MatchLevel) => {
    switch (level) {
      case 'superMatch':
        return styles.superMatchBadge;
      case 'match':
        return styles.matchBadge;
      default:
        return styles.nomatchBadge;
    }
  };
  
  const getMatchLevelText = (level: MatchLevel) => {
    switch (level) {
      case 'superMatch':
        return 'Super Match';
      case 'match':
        return 'Match';
      default:
        return 'No Match';
    }
  };
  
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  if (error || !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={60} color={COLORS.secondary} />
          <Text style={styles.errorText}>{error || 'Profile not found'}</Text>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container} edges={['top']} mode="padding">
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      
      <ScrollView style={styles.scrollView}>
        {/* Header with profile image */}
        <View style={styles.headerContainer}>
          <Image 
            source={{ uri: profile.profilePic }} 
            style={styles.profileImage} 
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.profileGradient}
          />
          
          <TouchableOpacity
            style={styles.backButtonTop}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          
          <View style={styles.matchBadgeContainer}>
            <View style={[styles.matchBadge, getMatchLevelStyle(matchLevel)]}>
              <Ionicons 
                name={matchLevel === 'superMatch' ? 'star' : 'heart'} 
                size={16} 
                color="#FFF" 
              />
              <Text style={styles.matchBadgeText}>{getMatchLevelText(matchLevel)}</Text>
            </View>
            
            <Text style={styles.commonShowsCount}>
              {commonShowIds.length} shows in common
            </Text>
          </View>
          
          <View style={styles.profileHeader}>
            <View style={styles.profileNameContainer}>
              <Text style={styles.profileName}>{profile.displayName}, {profile.age}</Text>
              <View style={styles.locationContainer}>
                <Ionicons name="location-outline" size={16} color="#FFF" />
                <Text style={styles.locationText}>{profile.location}</Text>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.chatButton} className='mt-8'
              onPress={() => router.push({
                pathname: '/(conversations)/chat',
                params: { matchId: userId, fromInbox: 'false' }
              })}
            >
              <Ionicons name="chatbubble" size={18} color="#FFF" />
              <Text style={styles.chatButtonText}>Chat</Text>
            </TouchableOpacity>
            
            {profile.bio && (
              <Text style={styles.profileBio} numberOfLines={3}>
                {profile.bio}
              </Text>
            )}
          </View>
        </View>
        
        {/* Profile Details */}
        <View style={styles.contentContainer}>
          {/* Basic Info */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person" size={20} color={COLORS.secondary} />
              <Text style={styles.sectionTitle}>Basic Info</Text>
            </View>
            
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Gender</Text>
                <Text style={styles.infoValue}>
                  {profile.gender === 'male' ? 'Male' : 'Female'}
                </Text>
              </View>
              
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{profile.location}</Text>
              </View>
              
              {profile.relationshipStatus && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Relationship</Text>
                  <Text style={styles.infoValue}>
                    {profile.relationshipStatus.charAt(0).toUpperCase() + 
                     profile.relationshipStatus.slice(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>
          
          {/* Common Shows */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="heart" size={20} color={COLORS.secondary} />
              <Text style={styles.sectionTitle}>Shows You Both Love</Text>
            </View>
            
            {commonShows.length > 0 ? (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.commonShowsContainer}
              >
                {commonShows.map(show => (
                  <View key={show.id} style={styles.showCard}>
                    <Image 
                      source={{ 
                        uri: show.posterPath 
                          ? `${TMDB_IMAGE_BASE_URL}w185${show.posterPath}` 
                          : 'https://via.placeholder.com/185x278?text=No+Image'
                      }} 
                      style={styles.showImage} 
                    />
                    <View 
                      style={[
                        styles.showTypeBadge,
                        {backgroundColor: show.type === 'anime' ? COLORS.quaternary : COLORS.tertiary}
                      ]}
                    >
                      <Text style={styles.showTypeBadgeText}>
                        {show.type === 'anime' ? '🍡 Anime' : '🧋 K-Drama'}
                      </Text>
                    </View>
                    <Text style={styles.showTitle} numberOfLines={2}>{show.title}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.noContentText}>Shows are loading...</Text>
            )}
          </View>
          
          {/* Favorite Movie & Band */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="heart-circle" size={20} color={COLORS.secondary} />
              <Text style={styles.sectionTitle}>Other Interests</Text>
            </View>
            
            {(profile.favoriteMovie || profile.favoriteBand || profile.favoriteAnime || profile.favoriteKdrama) ? (
              <View style={styles.interestsContainer}>
                {profile.favoriteMovie && (
                  <View style={styles.interestItem}>
                    <Ionicons name="film-outline" size={20} color={COLORS.secondary} />
                    <View style={styles.interestTextContainer}>
                      <Text style={styles.interestLabel}>Favorite Movie</Text>
                      <Text style={styles.interestValue}>{profile.favoriteMovie}</Text>
                    </View>
                  </View>
                )}
                
                {profile.favoriteBand && (
                  <View style={styles.interestItem}>
                    <Ionicons name="musical-notes-outline" size={20} color={COLORS.secondary} />
                    <View style={styles.interestTextContainer}>
                      <Text style={styles.interestLabel}>Favorite Music</Text>
                      <Text style={styles.interestValue}>{profile.favoriteBand}</Text>
                    </View>
                  </View>
                )}
                
                {profile.favoriteAnime && (
                  <View style={styles.interestItem}>
                    <Ionicons name="tv-outline" size={20} color={COLORS.secondary} />
                    <View style={styles.interestTextContainer}>
                      <Text style={styles.interestLabel}>Favorite Anime</Text>
                      <Text style={styles.interestValue}>{profile.favoriteAnime}</Text>
                    </View>
                  </View>
                )}
                
                {profile.favoriteKdrama && (
                  <View style={styles.interestItem}>
                    <Ionicons name="tv-outline" size={20} color={COLORS.secondary} />
                    <View style={styles.interestTextContainer}>
                      <Text style={styles.interestLabel}>Favorite K-Drama</Text>
                      <Text style={styles.interestValue}>{profile.favoriteKdrama}</Text>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.noContentText}>No other interests shared</Text>
            )}
          </View>
        </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 12,
    marginBottom: 20,
    fontSize: 18,
    color: COLORS.secondary,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: COLORS.secondary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  headerContainer: {
    height: height * 0.4,
    position: 'relative',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  profileGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  backButtonTop: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchBadgeContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    right: 20,
    alignItems: 'center',
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,204,225,0.9)',
  },
  superMatchBadge: {
    backgroundColor: 'rgba(255,215,0,0.9)',
  },
  nomatchBadge: {
    backgroundColor: 'rgba(150,150,150,0.9)',
  },
  matchBadgeText: {
    marginLeft: 4,
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  commonShowsCount: {
    marginTop: 6,
    color: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
  },
  profileHeader: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  profileNameContainer: {
    flex: 1,
    marginRight: 100,
  },
  profileName: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    color: '#FFF',
    fontSize: 16,
    marginLeft: 4,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  profileBio: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    opacity: 0.9,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
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
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondary,
    marginLeft: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  commonShowsContainer: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  showCard: {
    width: 120,
    marginRight: 16,
  },
  showImage: {
    width: 120,
    height: 180,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  showTypeBadge: {
    position: 'absolute',
    top: 8,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: COLORS.quaternary,
  },
  showTypeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  showTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginTop: 8,
    textAlign: 'center',
  },
  interestsContainer: {
    marginTop: 8,
  },
  interestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  interestTextContainer: {
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
  },
  noContentText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  chatButton: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  chatButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 6,
    fontSize: 15,
  },
}); 