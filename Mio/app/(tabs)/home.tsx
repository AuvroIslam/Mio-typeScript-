import React, { useState, useEffect, useCallback } from 'react';
import {
  View, 
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Platform,
 
  Modal,
  
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants/Colors';
import { debounce } from 'lodash';
import * as Haptics from 'expo-haptics';
import icon from '../../assets/images/icon.png';
import mioLogo from '../../assets/images/mioLogo.png';
import { useFavorites } from '../../context/FavoritesContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.42;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';
const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
const MAX_FAVORITES = 10;
const MAX_WEEKLY_REMOVALS = 5;

interface ShowItem {
  id: number;
  title: string;
  name?: string;
  posterPath: string;
  overview: string;
  type: 'anime' | 'kdrama';
  genreIds?: number[];
  originCountry?: string[];
  originalLanguage?: string;
  order?: number; // For sorting in admin-specified order
}

// Feedback Modal component similar to seriesDetails.tsx
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
async function classifyShow(show: any): Promise<ShowItem | null> {
  // Check for K-Drama based on language or country
  const isKDrama =
    show.original_language === 'ko' &&
    (show.origin_country && show.origin_country.includes('KR'));

  // Check for Anime based on origin country or genre_ids (Animation genre: id 16)
  const isAnime =
    (show.origin_country && show.origin_country.includes('JP')) &&
    (show.genre_ids && show.genre_ids.includes(16));

  // Only return the show if it's either anime or K-drama
  if (isAnime || isKDrama) {
    return {
      id: show.id,
      title: show.name,
      posterPath: show.poster_path,
      overview: show.overview,
      type: isAnime ? 'anime' : 'kdrama',
      genreIds: show.genre_ids,
      originCountry: show.origin_country,
      originalLanguage: show.original_language,
    };
  }
  return null;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { 
   
    isFavorite, 
    confirmAddToFavorites,
    confirmRemoveFromFavorites,
    isAddingToFavorites,
    refreshUserFavorites,
    removalCount,
    getTotalFavorites
  } = useFavorites();
  
  // Add logging to verify context is accessible

  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ShowItem[]>([]);
  const [trendingShows, setTrendingShows] = useState<ShowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedShowForFavorite, setSelectedShowForFavorite] = useState<ShowItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'error' | 'warning'
  });
  // Add states for confirmation modals
  const [confirmAddModal, setConfirmAddModal] = useState(false);
  const [confirmRemoveModal, setConfirmRemoveModal] = useState(false);

  // Fetch user favorites on mount and refresh when favorites change
  useEffect(() => {
    fetchTrendingShows('week');
  }, [user]);
  
  // Force re-render when userFavorites changes to update UI


  // Update to open appropriate confirmation modal
  const handleFavoriteToggle = (show: ShowItem) => {
    setSelectedShowForFavorite(show);
    
    const currentlyFavorite = isFavorite(show);

    
    // Trigger haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    if (currentlyFavorite) {
      // Show confirmation for removal
      setConfirmRemoveModal(true);
    } else {
      // Show confirmation for adding
      setConfirmAddModal(true);
    }
  };
  
  // Handle confirming addition of a favorite
  const handleConfirmAddition = () => {
    if (!selectedShowForFavorite) return;
    
    setConfirmAddModal(false);
    
    confirmAddToFavorites(
      selectedShowForFavorite,
      // Success callback
      () => {
   
        
        // Refresh favorites from Firestore to ensure UI is in sync
        refreshUserFavorites().then(() => {
   
          setFeedbackModal({
            visible: true,
            message: `Added to your favorites`,
            type: 'success'
          });
        });
      },
      // Error callback
      () => {
        console.error(`Home: Failed to add ${selectedShowForFavorite.title} to favorites`);
        setFeedbackModal({
          visible: true,
          message: 'Failed to add to favorites. Please try again.',
          type: 'error'
        });
      },
      // Limit callback
      () => {
        console.warn(`Home: Favorites limit reached (${MAX_FAVORITES} maximum)`);
        setFeedbackModal({
          visible: true,
          message: `You can only add up to ${MAX_FAVORITES} favorites. Please remove some before adding more.`,
          type: 'warning'
        });
      }
    );
  };
  
  // Handle confirming removal of a favorite
  const handleConfirmRemoval = () => {
    if (!selectedShowForFavorite) return;
    
    setConfirmRemoveModal(false);
    
    confirmRemoveFromFavorites(
      selectedShowForFavorite,
      // Success callback
      () => {
     
        
        // Refresh favorites from Firestore to ensure UI is in sync
        refreshUserFavorites().then(() => {
       
          setFeedbackModal({
            visible: true,
            message: `Removed from your favorites`,
            type: 'success'
          });
        });
      },
      // Error callback
      () => {
        console.error(`Home: Failed to remove ${selectedShowForFavorite.title} from favorites`);
        setFeedbackModal({
          visible: true,
          message: 'Failed to remove from favorites. Please try again.',
          type: 'error'
        });
      },
      // Cooldown callback
      (cooldownTime) => {
        console.warn(`Home: Cooldown active (${cooldownTime}s) when trying to remove ${selectedShowForFavorite.title}`);
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

  // Refactor the fetchTrendingShows function to use Firestore single document
  const fetchTrendingShows = async (timeWindow: 'week') => {
    setIsLoading(true);
    try {
      // Check if API key is available
      if (!TMDB_API_KEY) {
        throw new Error('TMDB API key is not configured');
      }

      // Get trending shows from single Firestore document (only 1 read operation)
      const trendingDocRef = doc(db, 'trending', 'trendingShows');
      const trendingDoc = await getDoc(trendingDocRef);
      
      if (trendingDoc.exists() && trendingDoc.data().shows && trendingDoc.data().shows.length > 0) {
        const shows = trendingDoc.data().shows as ShowItem[];
        
        // Sort by order field to maintain admin-specified ordering
        shows.sort((a, b) => (a.order || 0) - (b.order || 0));
       
        
        setTrendingShows(shows);
      } else {
      
        // Fetch K-Drama using the discover endpoint
        const kdramaResponse = await fetch(
          `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=KR&with_original_language=ko&sort_by=popularity.desc`
        );
        if (!kdramaResponse.ok) {
          throw new Error(`K-Drama API request failed with status: ${kdramaResponse.status}`);
        }
        const kdramaData = await kdramaResponse.json();
    
        // Fetch Anime using the discover endpoint with keyword filtering
        const animeResponse = await fetch(
          `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=JP&with_keywords=210024&sort_by=popularity.desc`
        );
        if (!animeResponse.ok) {
          throw new Error(`Anime API request failed with status: ${animeResponse.status}`);
        }
        const animeData = await animeResponse.json();
    
        // Merge the two results arrays
        const combinedResults = interleavePreservingOrder(
          (kdramaData.results || []),
          (animeData.results || []))
      
        // Classify each show using your classifyShow helper (which will label them as 'kdrama' or 'anime')
        const classifiedShows = await Promise.all(
          combinedResults.map((show: any) => classifyShow(show))
        );
    
        // Filter out null values from classification
        let filteredShows = classifiedShows.filter((show): show is ShowItem => show !== null);
        
        // Limit the number of items
        filteredShows = filteredShows.slice(0, 30);
        
        setTrendingShows(filteredShows);
      }
    } catch (error) {
      console.error('Error fetching trending shows:', error);
      setFeedbackModal({
        visible: true,
        message: 'Failed to load trending shows. Please try again.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };
  function interleavePreservingOrder<T>(list1: T[], list2: T[]): T[] {
    const result: T[] = [];
    let i = 0, j = 0;
  
    // Continue until both lists are exhausted.
    while (i < list1.length || j < list2.length) {
      // If one list is exhausted, take from the other.
      if (i >= list1.length) {
        result.push(list2[j++]);
      } else if (j >= list2.length) {
        result.push(list1[i++]);
      } else {
        // Randomly choose from either list, preserving internal order.
        if (Math.random() < 0.5) {
          result.push(list1[i++]);
        } else {
          result.push(list2[j++]);
        }
      }
    }
    return result;
  }
  
  
  // Helper function to shuffle an array (Fisher-Yates algorithm)
  
  

  // Refactor the handleSearch function to use the helper and improve deduplication
  const handleSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        // Check if API key is available
        if (!TMDB_API_KEY) {
          throw new Error('TMDB API key is not configured');
        }
        
        // Search using a single API call
        const searchResponse = await fetch(
          `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`
        );
        
        if (!searchResponse.ok) {
          throw new Error(`Search API request failed with status: ${searchResponse.status}`);
        }
        
        const searchData = await searchResponse.json();
        
        if (!searchData.results) {
          throw new Error('Failed to search shows');
        }
        
        // ******************************************
        // DUPLICATION CHECK: Using Map to ensure unique shows by name
        // ******************************************
        
        // Group results by original title to avoid duplicates
        const showMap = new Map<string, ShowItem>();
        
        // Classify each show
        const classifiedShows = await Promise.all(
          searchData.results.map((show: any) => classifyShow(show))
        );
        
        // Filter out null results and add to map to deduplicate
        classifiedShows
          .filter((show): show is ShowItem => show !== null)
          .forEach(show => {
            const nameKey = show.title.toLowerCase();
            // This is the key deduplication check
            if (!showMap.has(nameKey)) {
              showMap.set(nameKey, show);
            }
          });
        
        // Convert map to array for rendering
        const uniqueResults = Array.from(showMap.values());
        // ******************************************
        // END DUPLICATION CHECK
        // ******************************************
        
        setSearchResults(uniqueResults);
      } catch (error) {
        console.error('Error searching shows:', error);
        setFeedbackModal({
          visible: true,
          message: 'Search failed. Please try again.',
          type: 'error'
        });
      } finally {
        setIsSearching(false);
      }
    }, 500),
    []
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Also refresh favorites when pulling to refresh
    refreshUserFavorites().then(() => {
      fetchTrendingShows('week');
    });
  }, []);

  const renderShowCard = ({ item }: { item: ShowItem }) => {
    const favorite = isFavorite(item);
    
    return (
      <TouchableOpacity 
        style={styles.cardContainer}
        onPress={() => router.push({
          pathname: "/(common)/seriesDetails",
          params: { 
            id: item.id.toString(),
            type: item.type
          }
        })}
        activeOpacity={0.7}
      >
        <View style={styles.card}>
          <Image 
            source={{ 
              uri: item.posterPath 
                ? `${TMDB_IMAGE_BASE_URL}w500${item.posterPath}` 
                : Image.resolveAssetSource(icon).uri
            }} 
            style={styles.cardImage} 
          />
          
          {/* Type label - Cute version */}
          <View 
            style={[
              styles.typeLabel, 
              {backgroundColor: item.type === 'anime' ? COLORS.quaternary : COLORS.tertiary}
            ]}
          >
            <Text 
              style={[
                styles.typeLabelText, 
                {color:  COLORS.secondary}
              ]}
            >
              {item.type === 'anime' ? '🍡 Anime' : '🧋 K-Drama'}
            </Text>
          </View>
          
          {/* Updated favorite button to match seriesDetails.tsx style */}
          <View style={styles.cardOverlay}>
            <TouchableOpacity 
              style={[styles.favoriteButton, favorite ? styles.favoriteButtonActive : {}]}
              onPress={(e) => {
                e.stopPropagation();
                handleFavoriteToggle(item);
              }}
              disabled={isAddingToFavorites && selectedShowForFavorite?.id === item.id}
            >
              {isAddingToFavorites && selectedShowForFavorite?.id === item.id ? (
                <ActivityIndicator size="small" color={favorite ? "#FFF" : COLORS.secondary} />
              ) : (
                <>
                  <Ionicons 
                    name={favorite ? "heart" : "heart-outline"} 
                    size={16} 
                    color={favorite ? "#FFF" : COLORS.secondary} 
                  />
                  <Text style={[styles.favoriteButtonText, favorite ? styles.favoriteButtonTextActive : {}]}>
                    {favorite ? 'Favorite' : 'Add'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Image 
            source={mioLogo}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        {/* Add favorites counter badge */}
        <View style={styles.favoritesCountContainer}>
          <Ionicons name="heart" size={18} color="#FFF" />
          <Text style={styles.favoritesCountText}>
            {getTotalFavorites()}/{MAX_FAVORITES}
          </Text>
        </View>
      </View>
      
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search-outline" size={20} color={COLORS.darkestMaroon} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search anime or K-drama..."
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              handleSearch(text);
            }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              onPress={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      {isSearching ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : searchQuery.length > 0 ? (
        searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            renderItem={renderShowCard}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            numColumns={2}
            contentContainerStyle={styles.gridContainer}
            {...Platform.select({
              web: {
                scrollEnabled: true,
                showsVerticalScrollIndicator: true,
                decelerationRate: 'normal',
                scrollEventThrottle: 16,
              }
            })}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="search" size={60} color={COLORS.secondary} opacity={0.5} />
            <Text style={styles.emptyText}>No results found</Text>
            <Text style={styles.emptySubText}>Try a different search term</Text>
          </View>
        )
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          {...Platform.select({
            web: {
              scrollEnabled: true,
              showsVerticalScrollIndicator: true,
              decelerationRate: 'normal',
              scrollEventThrottle: 16,
              overScrollMode: 'always',
            }
          })}
        >
          {/* Weekly Trending Section Title */}
          <View style={styles.trendingTitleContainer}>
            <Text style={styles.sectionTitle}>Weekly Trending</Text>
          </View>
          
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.secondary} />
              <Text style={styles.loadingText}>Loading trending shows...</Text>
            </View>
          ) : (
            <FlatList
              data={trendingShows}
              renderItem={renderShowCard}
              keyExtractor={(item) => `${item.type}-${item.id}`}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={styles.gridContainer}
              ListEmptyComponent={() => (
                <View style={styles.emptyContainer}>
                  <Ionicons name="trending-up" size={60} color={COLORS.secondary} opacity={0.5} />
                  <Text style={styles.emptyText}>No trending shows found</Text>
                  <Text style={styles.emptySubText}>Pull down to refresh</Text>
                </View>
              )}
            />
          )}
        </ScrollView>
      )}
      
      {/* Add Confirmation Modal */}
      <Modal
        visible={confirmAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Ionicons name="heart" size={60} color={COLORS.primary} />
            <Text style={styles.confirmTitle}>Add to Favorites?</Text>
            <Text style={styles.confirmMessage}>
              You have {MAX_FAVORITES - getTotalFavorites()} slots left.
            </Text>
            
            <View style={styles.confirmButtons}>
              <TouchableOpacity 
                style={[styles.confirmButton, styles.cancelButton]} 
                onPress={() => {
                  setConfirmAddModal(false);
                  setSelectedShowForFavorite(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.confirmButton, styles.addConfirmButton]}
                onPress={handleConfirmAddition}
              >
                <Text style={styles.addConfirmButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Remove Confirmation Modal */}
      <Modal
        visible={confirmRemoveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmRemoveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Ionicons name="alert-circle-outline" size={60} color={COLORS.darkMaroon} />
            <Text style={styles.confirmTitle}>Remove from Favorites?</Text>
            <Text style={styles.confirmMessage}>
              You have {MAX_WEEKLY_REMOVALS - removalCount} removals left.
              {removalCount === MAX_WEEKLY_REMOVALS - 1 && 
                ' This will be your last removal before the cooldown starts.'}
            </Text>
            
            <View style={styles.confirmButtons}>
              <TouchableOpacity 
                style={[styles.confirmButton, styles.cancelButton]} 
                onPress={() => {
                  setConfirmRemoveModal(false);
                  setSelectedShowForFavorite(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.confirmButton, styles.removeConfirmButton]}
                onPress={handleConfirmRemoval}
              >
                <Text style={styles.removeConfirmButtonText}>Remove</Text>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchContainer: {
    marginTop: 10,
    paddingHorizontal: 20,
    marginBottom:5,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    height: '100%',
  },
  clearButton: {
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 20,
    ...Platform.select({
      web: {
        paddingBottom: 80,
      }
    })
  },
  trendingTitleContainer: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginBottom: 10,
  },
  gridContainer: {
    paddingHorizontal: 10,
    ...Platform.select({
      web: {
        paddingBottom: 80,
        paddingTop: 10,
      }
    })
  },
  cardContainer: {
    width: '50%',
    padding: 10,
    ...Platform.select({
      web: {
        minHeight: 320,
      }
    })
  },
  card: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F2F2F2',
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
  cardImage: {
    width: '100%',
    height: CARD_HEIGHT,
    resizeMode: 'cover',
    borderWidth: .5,
    borderColor: COLORS.maroon,
    borderRadius: 12,
    
  },
  cardTitle: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.darkestMaroon,
    textAlign: 'center',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    padding: 0,
    backgroundColor: 'transparent',
  },
  favoriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  favoriteButtonActive: {
    backgroundColor: COLORS.primary,
  },
  favoriteButtonText: {
    marginLeft: 4,
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.secondary,
  },
  favoriteButtonTextActive: {
    color: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.secondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  emptySubText: {
    marginTop: 8,
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
  addConfirmButton: {
    backgroundColor: COLORS.secondary,
    marginLeft: 8,
  },
  addConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
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
  favoritesCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  favoritesCountText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  typeLabel: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    opacity: 0.9,
  },
  typeLabelText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  logoImage: {
    width: 60,
    height: 30,
    
  },
});