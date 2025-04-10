import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Dimensions,
  StatusBar,
  Modal,
  
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/Colors';

import placeholderIcon from '../../assets/images/icon.png';
import { useFavorites } from '../../context/FavoritesContext';

const { width, height } = Dimensions.get('window');
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';
const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
const MAX_FAVORITES = 10;
const MAX_WEEKLY_REMOVALS = 5; // Assuming a default value, actual implementation needed

interface ShowItem {
  id: number;
  title: string;
  posterPath: string;
  overview: string;
  type: 'anime' | 'kdrama';
}

interface ShowDetails {
  id: number;
  name: string;
  overview: string;
  backdrop_path: string | null;
  poster_path: string | null;
  genres: { id: number; name: string }[];
  first_air_date: string;
  vote_average: number;
  type: 'anime' | 'kdrama';
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  status?: string;
  original_language?: string;
  origin_country?: string[];
  created_by?: any[];
  networks?: any[];
}

// Feedback Modal component
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
  let iconName: keyof typeof Ionicons.glyphMap = 'checkmark-circle';
  let iconColor = COLORS.secondary;
  
  if (type === 'error') {
    iconName = 'close-circle';
    iconColor = '#FF6B6B';
  } else if (type === 'warning') {
    iconName = 'alert-circle';
    iconColor = '#FFA500';
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

export default function SeriesDetailsScreen() {
  const params = useLocalSearchParams();

  const { 
  
    isFavorite, 
    confirmAddToFavorites, 
    confirmRemoveFromFavorites,
    isAddingToFavorites,
    isRemovingFavorite,
    removalCount,
    refreshUserFavorites,
    getTotalFavorites
  } = useFavorites();
  
  const [showDetails, setShowDetails] = useState<ShowDetails | null>(null);
  const [similarShows, setSimilarShows] = useState<ShowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedShowForFavorite, setSelectedShowForFavorite] = useState<ShowItem | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'error' | 'warning'
  });
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [forceRender, setForceRender] = useState(0); // Add a counter to force re-renders



  // Helper function to convert ShowDetails to ShowItem for favorites functions
  const toShowItem = (details: ShowDetails): ShowItem => ({
    id: details.id,
    title: details.name,
    posterPath: details.poster_path || '',
    overview: details.overview,
    type: details.type
  });
  
  // Check if this show is a favorite
  const isShowFavorite = (details: ShowDetails): boolean => {
    if (!details) return false;
    return isFavorite(toShowItem(details));
  };
  
  // Check if this show is being removed
  const isShowBeingRemoved = (details: ShowDetails): boolean => {
    if (!details) return false;
    return isRemovingFavorite && selectedShowForFavorite?.id === details.id;
  };

  // Get the show ID and type from params
  const showId = params.id as string;
  const showType = params.type as 'anime' | 'kdrama';
  
  // Fetch show details on mount
  useEffect(() => {
    if (showId) {
      fetchShowDetails();
    }
  }, [showId, showType]);

  const fetchShowDetails = async () => {
    if (!showId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Check if API key is available
      if (!TMDB_API_KEY) {
        throw new Error('TMDB API key is not configured');
      }
      
      // Fetch show details from TMDB
      const detailsResponse = await fetch(
        `https://api.themoviedb.org/3/tv/${showId}?api_key=${TMDB_API_KEY}&append_to_response=similar`
      );
      
      if (!detailsResponse.ok) {
        throw new Error(`Failed to fetch show details. Status: ${detailsResponse.status}`);
      }
      
      const data = await detailsResponse.json();
      
      if (!data || !data.name) {
        throw new Error('Invalid show data received from API');
      }
      
      // Format show details
      setShowDetails({
        id: data.id,
        name: data.name,
        overview: data.overview,
        backdrop_path: data.backdrop_path,
        poster_path: data.poster_path,
        genres: data.genres || [],
        first_air_date: data.first_air_date,
        vote_average: data.vote_average,
        type: showType,
        number_of_seasons: data.number_of_seasons,
        number_of_episodes: data.number_of_episodes,
        episode_run_time: data.episode_run_time,
        status: data.status,
        original_language: data.original_language,
        origin_country: data.origin_country,
        created_by: data.created_by,
        networks: data.networks
      });
      
      // Format similar shows
      if (data.similar && data.similar.results) {
        const formattedSimilar = data.similar.results.map((show: any) => ({
          id: show.id,
          title: show.name,
          posterPath: show.poster_path,
          overview: show.overview,
          type: showType
        })).slice(0, 10);
        
        setSimilarShows(formattedSimilar);
      }
    } catch (error) {
      console.error('Error fetching show details:', error);
      setError(`Failed to load show details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };


  const handleFavoriteToggle = () => {
    if (!showDetails) return;
    
    // Convert ShowDetails to ShowItem format for favorites context
    const show = toShowItem(showDetails);
    
  
    
    setSelectedShowForFavorite(show);
    
    // Check if it's already a favorite
    const favorite = isFavorite(show);
    
    if (favorite) {
      // Show confirmation modal for removal
      
      setConfirmModal(true);
    } else {
      // Add to favorites
      
      confirmAddToFavorites(
        show,
        // Success callback
        () => {
        
          // Force a re-render to update UI
          refreshUserFavorites().then(() => {
            setForceRender(prev => prev + 1);
            setFeedbackModal({
              visible: true,
              message: `Added to your favorites`,
              type: 'success'
            });
          });
        },
        // Error callback
        () => {
          console.error(`Series Details: Failed to add ${show.title} to favorites`);
          setFeedbackModal({
            visible: true,
            message: 'Failed to add to favorites. Please try again.',
            type: 'error'
          });
        },
        // Limit callback
        () => {
          console.warn(`Series Details: Favorites limit reached (${MAX_FAVORITES} maximum)`);
          setFeedbackModal({
            visible: true,
            message: `You can only add up to ${MAX_FAVORITES} favorites. Please remove some before adding more.`,
            type: 'warning'
          });
        }
      );
    }
  };

  // Handle confirmation of removal
  const handleConfirmRemoval = () => {
    if (!selectedShowForFavorite) return;
    
    
    
    confirmRemoveFromFavorites(
      selectedShowForFavorite,
      // Success callback
      () => {
   
        setConfirmModal(false);
        // Force a re-render to update UI
        refreshUserFavorites().then(() => {
          setForceRender(prev => prev + 1);
          setFeedbackModal({
            visible: true,
            message: `Removed from your favorites`,
            type: 'success'
          });
        });
      },
      // Error callback
      () => {
        console.error(`Series Details: Failed to remove ${selectedShowForFavorite.title} from favorites`);
        setConfirmModal(false);
        setFeedbackModal({
          visible: true,
          message: 'Failed to remove from favorites. Please try again.',
          type: 'error'
        });
      },
      // Cooldown callback
      (cooldownTime) => {
        console.warn(`Series Details: Cooldown active (${cooldownTime}s) when trying to remove ${selectedShowForFavorite.title}`);
        setConfirmModal(false);
        const minutes = Math.floor(cooldownTime / 60);
        const seconds = cooldownTime % 60;
        setFeedbackModal({
          visible: true,
          message: `Cooldown active. Please wait ${minutes}:${seconds < 10 ? '0' + seconds : seconds} before removing another show.`,
          type: 'warning'
        });
      }
    );
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const renderRating = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating / 2);
    const halfStar = rating % 2 >= 1;
    
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<Ionicons key={i} name="star" size={18} color="#FFD700" />);
      } else if (i === fullStars && halfStar) {
        stars.push(<Ionicons key={i} name="star-half" size={18} color="#FFD700" />);
      } else {
        stars.push(<Ionicons key={i} name="star-outline" size={18} color="#FFD700" />);
      }
    }
    
    return (
      <View style={styles.ratingContainer}>
        <View style={styles.starsContainer}>{stars}</View>
        <Text style={styles.ratingText}>{(rating / 2).toFixed(1)}/5</Text>
      </View>
    );
  };

  const renderSimilarShows = () => {
    if (loadingSimilar) {
      return (
        <View style={styles.loadingSimilar}>
          <ActivityIndicator size="small" color={COLORS.secondary} />
          <Text style={styles.loadingSimilarText}>Loading similar shows...</Text>
        </View>
      );
    }
    
    if (similarShows.length === 0) {
      return (
        <View style={styles.emptySimilar}>
          <Text style={styles.emptySimilarText}>No similar shows found</Text>
        </View>
      );
    }
    
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.similarShowsContainer}
      >
        {similarShows.map(show => (
          <TouchableOpacity 
            key={show.id} 
            style={styles.similarShowCard}
            onPress={() => router.push({
              pathname: "/(common)/seriesDetails",
              params: { id: show.id.toString(), type: show.type }
            })}
          >
            <Image 
              source={{ 
                uri: show.posterPath 
                  ? `${TMDB_IMAGE_BASE_URL}w185${show.posterPath}` 
                  : Image.resolveAssetSource(placeholderIcon).uri
              }} 
              style={styles.similarShowImage}
            />
            <Text style={styles.similarShowTitle} numberOfLines={2}>{show.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  if (!showDetails) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={60} color={COLORS.secondary} />
        <Text style={styles.errorText}>Failed to load show details</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      
      <ScrollView style={styles.scrollView}>
        {/* Header with backdrop */}
        <View style={styles.headerContainer}>
          <Image 
            source={{ 
              uri: showDetails.backdrop_path 
                ? `${TMDB_IMAGE_BASE_URL}w780${showDetails.backdrop_path}` 
                : Image.resolveAssetSource(placeholderIcon).uri
            }} 
            style={styles.backdropImage} 
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.backdropGradient}
          />
          
          <TouchableOpacity
            style={styles.backButtonTop}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{showDetails.name}</Text>
            <View style={styles.infoBadges}>
              <View style={[
                styles.badge, 
                { 
                  backgroundColor: showDetails.type === 'anime' 
                    ? 'rgba(140, 111, 247, 0.8)' 
                    : 'rgba(255, 146, 139, 0.8)' 
                }
              ]}>
                <Ionicons 
                  name={showDetails.type === 'anime' ? "videocam-outline" : "tv-outline"} 
                  size={12} 
                  color="#FFF" 
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.badgeText}>
                  {showDetails.type === 'anime' ? 'Anime' : 'K-Drama'}
                </Text>
              </View>
              
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {showDetails.first_air_date?.split('-')[0] || 'Unknown'}
                </Text>
              </View>
              
              {showDetails.status && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{showDetails.status}</Text>
                </View>
              )}
              
              {showDetails.origin_country && showDetails.origin_country[0] && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{showDetails.origin_country[0]}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        
        {/* Content */}
        <View style={styles.contentContainer}>
          <View style={styles.posterAndInfo}>
            <Image 
              source={{ 
                uri: showDetails.poster_path 
                  ? `${TMDB_IMAGE_BASE_URL}w342${showDetails.poster_path}` 
                  : Image.resolveAssetSource(placeholderIcon).uri
              }} 
              style={styles.posterImage} 
            />
            
            <View style={styles.infoContainer}>
              {renderRating(showDetails.vote_average)}
              
              <View style={styles.infoItem}>
                <Ionicons name="calendar-outline" size={18} color={COLORS.secondary} />
                <Text style={styles.infoText}>
                  Released: {formatDate(showDetails.first_air_date)}
                </Text>
              </View>
              
              {showDetails.number_of_seasons && (
                <View style={styles.infoItem}>
                  <Ionicons name="film-outline" size={18} color={COLORS.secondary} />
                  <Text style={styles.infoText}>
                    {showDetails.number_of_seasons} Season{showDetails.number_of_seasons !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              
              {showDetails.number_of_episodes && (
                <View style={styles.infoItem}>
                  <Ionicons name="tv-outline" size={18} color={COLORS.secondary} />
                  <Text style={styles.infoText}>
                    {showDetails.number_of_episodes} Episode{showDetails.number_of_episodes !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              
              {showDetails.episode_run_time && showDetails.episode_run_time.length > 0 && (
                <View style={styles.infoItem}>
                  <Ionicons name="time-outline" size={18} color={COLORS.secondary} />
                  <Text style={styles.infoText}>
                    {showDetails.episode_run_time[0]} min per episode
                  </Text>
                </View>
              )}
              
              <TouchableOpacity 
                style={[
                  styles.favoriteButton,
                  isShowFavorite(showDetails) ? styles.favoriteButtonActive : {}
                ]}
                onPress={handleFavoriteToggle}
                disabled={isAddingToFavorites || isRemovingFavorite}
              >
                {isShowBeingRemoved(showDetails) ? (
                  <ActivityIndicator size="small" color={isShowFavorite(showDetails) ? "#FFF" : COLORS.secondary} />
                ) : (
                  <>
                    <Ionicons 
                      name={isShowFavorite(showDetails) ? "heart" : "heart-outline"} 
                      size={22} 
                      color={isShowFavorite(showDetails) ? "#FFF" : COLORS.secondary} 
                    />
                    <Text style={[
                      styles.favoriteButtonText,
                      isShowFavorite(showDetails) ? styles.favoriteButtonTextActive : {}
                    ]}>
                      {isShowFavorite(showDetails) ? 'Remove from Favorites' : 'Add to Favorites'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Genres */}
          {showDetails.genres && showDetails.genres.length > 0 && (
            <View style={styles.genresSection}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.genresContainer}
              >
                {showDetails.genres.map(genre => (
                  <View key={genre.id} style={styles.genreBadge}>
                    <Text style={styles.genreBadgeText}>{genre.name}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          
          {/* Overview */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <Text style={styles.overviewText}>
              {showDetails.overview || 'No overview available.'}
            </Text>
          </View>
          
          {/* Networks */}
          {showDetails.networks && showDetails.networks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Networks</Text>
              <View style={styles.networksContainer}>
                {showDetails.networks.map(network => (
                  <View key={network.id} style={styles.networkItem}>
                    {network.logo_path ? (
                      <Image 
                        source={{ uri: `${TMDB_IMAGE_BASE_URL}w92${network.logo_path}` }} 
                        style={styles.networkLogo} 
                        resizeMode="contain"
                      />
                    ) : (
                      <Text style={styles.networkName}>{network.name}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
          
          {/* Similar Shows */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Similar Shows</Text>
            {renderSimilarShows()}
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
            <Ionicons name="heart" size={60} color={COLORS.primary} />
            <Text style={styles.confirmTitle}>Remove from Favorites?</Text>
            <Text style={styles.confirmMessage}>
              You have {MAX_FAVORITES - getTotalFavorites()} slots left and {MAX_WEEKLY_REMOVALS - removalCount} removals left.
            </Text>
            
            <View style={styles.confirmButtons}>
              <TouchableOpacity 
                style={[styles.confirmButton, styles.cancelButton]} 
                onPress={handleConfirmRemoval}
              >
                <Text style={styles.cancelButtonText}>Remove</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.confirmButton, styles.addConfirmButton]}
                onPress={() => setConfirmModal(false)}
              >
                <Text style={styles.addConfirmButtonText}>Cancel</Text>
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
    marginTop: 12,
    fontSize: 16,
    color: COLORS.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 20,
  },
  errorText: {
    marginTop: 12,
    marginBottom: 20,
    fontSize: 18,
    fontWeight: 'bold',
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
    height: height * 0.35,
    position: 'relative',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  backdropGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '80%',
  },
  backButtonTop: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  title: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    marginBottom: 8,
  },
  infoBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
  },
  contentContainer: {
    padding: 20,
  },
  posterAndInfo: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  posterImage: {
    width: width * 0.3,
    height: width * 0.45,
    borderRadius: 12,
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
  infoContainer: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'space-between',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  ratingText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#333',
  },
  favoriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  favoriteButtonActive: {
    backgroundColor: COLORS.primary,
  },
  favoriteButtonText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondary,
  },
  favoriteButtonTextActive: {
    color: '#FFF',
  },
  genresSection: {
    marginBottom: 20,
  },
  genresContainer: {
    paddingVertical: 6,
  },
  genreBadge: {
    backgroundColor: COLORS.tertiary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  genreBadgeText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginBottom: 12,
  },
  overviewText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#333',
  },
  networksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  networkItem: {
    marginRight: 12,
    marginBottom: 12,
  },
  networkLogo: {
    height: 30,
    width: 60,
  },
  networkName: {
    fontSize: 14,
    color: '#333',
  },
  similarShowsContainer: {
    paddingBottom: 10,
  },
  similarShowCard: {
    width: 120,
    marginRight: 12,
  },
  similarShowImage: {
    width: 120,
    height: 180,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  similarShowTitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    color: '#333',
  },
  loadingSimilar: {
    padding: 20,
    alignItems: 'center',
  },
  loadingSimilarText: {
    marginTop: 8,
    fontSize: 14,
    color: '#888',
  },
  emptySimilar: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  emptySimilarText: {
    fontSize: 14,
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
  confirmModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    width: width * 0.8,
    padding: 24,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
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
    color: '#555',
  },
  addConfirmButton: {
    backgroundColor: COLORS.secondary,
    marginLeft: 8,
  },
  addConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
}); 