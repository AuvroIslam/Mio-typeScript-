import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/Colors';
import { getDoc, setDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { debounce } from 'lodash';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';

// Define show item interface
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
  order?: number; // For managing the display order
}

export default function TrendingManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ShowItem[]>([]);
  const [trendingShows, setTrendingShows] = useState<ShowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedShow, setSelectedShow] = useState<ShowItem | null>(null);

  // Fetch trending shows from Firestore (single document approach)
  const fetchTrendingShows = async () => {
    setIsLoading(true);
    try {
      const trendingDocRef = doc(db, 'trending', 'trendingShows');
      const trendingDoc = await getDoc(trendingDocRef);
      
      if (trendingDoc.exists() && trendingDoc.data().shows) {
        const shows = trendingDoc.data().shows as ShowItem[];
        // Sort by order field
        shows.sort((a, b) => (a.order || 0) - (b.order || 0));
        setTrendingShows(shows);
      } else {
        // Document doesn't exist or has no shows
        setTrendingShows([]);
      }
    } catch (error) {
      console.error('Error fetching trending shows:', error);
      Alert.alert('Error', 'Failed to load trending shows');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrendingShows();
  }, []);

  // Search TMDB for shows
  const handleSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        // USE environment variable
        const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
        if (!TMDB_API_KEY) {
          throw new Error("TMDB API Key is not defined!");
        }

        const searchResponse = await fetch(
          `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`
        );
        const searchData = await searchResponse.json();
        
        if (!searchData.results) {
          throw new Error('Failed to search shows');
        }
        
        // Process and filter the results
        const processedResults = searchData.results
          .filter((show: any) => {
            // Check if it's anime or K-drama
            const isKDrama =
              show.original_language === 'ko' &&
              (show.origin_country && show.origin_country.includes('KR'));

            const isAnime =
              (show.origin_country && show.origin_country.includes('JP')) &&
              (show.genre_ids && show.genre_ids.includes(16));

            return isAnime || isKDrama;
          })
          .map((show: any) => {
            const isAnime =
              (show.origin_country && show.origin_country.includes('JP')) &&
              (show.genre_ids && show.genre_ids.includes(16));

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
          });
        
        setSearchResults(processedResults);
      } catch (error) {
        console.error('Error searching shows:', error);
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to search shows. Please try again.');
      } finally {
        setIsSearching(false);
      }
    }, 500),
    []
  );

  // Add a show to trending
  const addToTrending = async (show: ShowItem) => {
    setIsSaving(true);
    try {
      // Check if already in trending
      const existingIndex = trendingShows.findIndex(item => item.id === show.id);
      
      if (existingIndex !== -1) {
        Alert.alert('Already Added', 'This show is already in the trending list');
        return;
      }
      
      // Add order at the end of the list
      const newShow = {
        ...show,
        order: trendingShows.length,
      };
      
      // Add to the trending shows array
      const updatedTrendingShows = [...trendingShows, newShow];
      
      // Save the entire array to the single document
      await setDoc(doc(db, 'trending', 'trendingShows'), {
        shows: updatedTrendingShows,
        updatedAt: new Date()
      });
      
      // Update local state
      setTrendingShows(updatedTrendingShows);
      Alert.alert('Success', 'Show added to trending list');
    } catch (error) {
      console.error('Error adding trending show:', error);
      Alert.alert('Error', 'Failed to add show to trending');
    } finally {
      setIsSaving(false);
    }
  };

  // Remove a show from trending
  const removeFromTrending = async (showId: number) => {
    try {
      // Remove from the array and reorder
      const newTrendingShows = trendingShows
        .filter(show => show.id !== showId)
        .map((show, index) => ({
          ...show,
          order: index
        }));
      
      // Save the updated array to Firestore
      await setDoc(doc(db, 'trending', 'trendingShows'), {
        shows: newTrendingShows,
        updatedAt: new Date()
      });
      
      setTrendingShows(newTrendingShows);
      Alert.alert('Success', 'Show removed from trending list');
    } catch (error) {
      console.error('Error removing trending show:', error);
      Alert.alert('Error', 'Failed to remove show from trending');
    }
  };

  // Move a show up or down in trending order
  const reorderShow = async (showId: number, direction: 'up' | 'down') => {
    const index = trendingShows.findIndex(show => show.id === showId);
    if (index === -1) return;
    
    // Can't move first item up or last item down
    if ((direction === 'up' && index === 0) || 
        (direction === 'down' && index === trendingShows.length - 1)) {
      return;
    }
    
    // Create a copy of the array
    const newOrder = [...trendingShows];
    
    // Swap positions
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = newOrder[index];
    newOrder[index] = newOrder[swapIndex];
    newOrder[swapIndex] = temp;
    
    // Update order values
    const updatedShows = newOrder.map((show, idx) => ({
      ...show,
      order: idx
    }));
    
    try {
      // Save the entire array with updated order
      await setDoc(doc(db, 'trending', 'trendingShows'), {
        shows: updatedShows,
        updatedAt: new Date()
      });
      
      setTrendingShows(updatedShows);
    } catch (error) {
      console.error('Error reordering shows:', error);
      Alert.alert('Error', 'Failed to reorder shows');
    }
  };

  // View show details
  const viewShowDetails = (show: ShowItem) => {
    setSelectedShow(show);
    setShowDetailsModal(true);
  };

  // Render a show card for search results
  const renderSearchResultCard = ({ item }: { item: ShowItem }) => {
    const isInTrending = trendingShows.some(show => show.id === item.id);
    
    return (
      <TouchableOpacity 
        style={styles.searchResultCard}
        onPress={() => viewShowDetails(item)}
        disabled={isInTrending}
      >
        <Image 
          source={{ 
            uri: item.posterPath 
              ? `${TMDB_IMAGE_BASE_URL}w200${item.posterPath}` 
              : 'https://via.placeholder.com/200x300?text=No+Image'
          }} 
          style={styles.resultCardImage} 
        />
        <View style={styles.resultCardContent}>
          <Text style={styles.resultCardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.resultCardType}>
            <Text style={[
              styles.typeLabel, 
              {color: item.type === 'anime' ? COLORS.quaternary : COLORS.tertiary}
            ]}>
              {item.type === 'anime' ? '🍡 Anime' : '🧋 K-Drama'}
            </Text>
          </View>
          <Text style={styles.resultCardDescription} numberOfLines={3}>
            {item.overview || 'No description available'}
          </Text>
          
          {isInTrending ? (
            <View style={styles.alreadyAddedButton}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.secondary} />
              <Text style={styles.alreadyAddedText}>Already in trending</Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => addToTrending(item)}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={16} color="#FFF" />
                  <Text style={styles.addButtonText}>Add to Trending</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Render trending show card
  const renderTrendingCard = ({ item, index }: { item: ShowItem, index: number }) => {
    return (
      <View style={styles.trendingCard}>
        <Text style={styles.orderNumber}>{index + 1}</Text>
        <Image 
          source={{ 
            uri: item.posterPath 
              ? `${TMDB_IMAGE_BASE_URL}w200${item.posterPath}` 
              : 'https://via.placeholder.com/200x300?text=No+Image'
          }} 
          style={styles.trendingCardImage} 
        />
        <View style={styles.trendingCardContent}>
          <Text style={styles.trendingCardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.trendingCardType}>
            <Text style={[
              styles.typeLabel, 
              {color: item.type === 'anime' ? COLORS.quaternary : COLORS.tertiary}
            ]}>
              {item.type === 'anime' ? '🍡 Anime' : '🧋 K-Drama'}
            </Text>
          </View>
          
          <View style={styles.trendingCardActions}>
            <TouchableOpacity 
              style={styles.orderButton}
              onPress={() => reorderShow(item.id, 'up')}
              disabled={index === 0}
            >
              <Ionicons 
                name="arrow-up" 
                size={18} 
                color={index === 0 ? '#CCC' : COLORS.secondary} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.orderButton}
              onPress={() => reorderShow(item.id, 'down')}
              disabled={index === trendingShows.length - 1}
            >
              <Ionicons 
                name="arrow-down" 
                size={18} 
                color={index === trendingShows.length - 1 ? '#CCC' : COLORS.secondary} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.removeButton}
              onPress={() => {
                Alert.alert(
                  'Confirm Removal',
                  `Remove "${item.title}" from trending?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeFromTrending(item.id) }
                  ]
                );
              }}
            >
              <Ionicons name="trash" size={18} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

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
        <Text style={styles.headerTitle}>Manage Trending</Text>
        <View style={styles.headerRight} />
      </View>
      
      {/* Search Section */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for anime or K-drama..."
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
            >
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      {/* Current Trending Shows Section */}
      {!searchQuery && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Current Trending Shows</Text>
            <Text style={styles.sectionSubtitle}>{trendingShows.length} shows</Text>
          </View>
          
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.secondary} />
              <Text style={styles.loadingText}>Loading trending shows...</Text>
            </View>
          ) : trendingShows.length > 0 ? (
            <FlatList
              data={trendingShows}
              renderItem={renderTrendingCard}
              keyExtractor={(item) => `trending-${item.id}`}
              contentContainerStyle={styles.trendingList}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="trending-up" size={60} color={COLORS.secondary} opacity={0.5} />
              <Text style={styles.emptyText}>No trending shows added yet</Text>
              <Text style={styles.emptySubText}>Search for shows to add them to trending</Text>
            </View>
          )}
        </>
      )}
      
      {/* Search Results Section */}
      {searchQuery && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Search Results</Text>
            {isSearching && <ActivityIndicator size="small" color={COLORS.secondary} />}
          </View>
          
          {isSearching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.secondary} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              renderItem={renderSearchResultCard}
              keyExtractor={(item) => `search-${item.id}`}
              contentContainerStyle={styles.searchResultsList}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={60} color={COLORS.secondary} opacity={0.5} />
              <Text style={styles.emptyText}>No results found</Text>
              <Text style={styles.emptySubText}>Try a different search term</Text>
            </View>
          )}
        </>
      )}
      
      {/* Show Details Modal */}
      <Modal
        visible={showDetailsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowDetailsModal(false)}
            >
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
            
            {selectedShow && (
              <View style={styles.showDetails}>
                <Image 
                  source={{ 
                    uri: selectedShow.posterPath 
                      ? `${TMDB_IMAGE_BASE_URL}w500${selectedShow.posterPath}` 
                      : 'https://via.placeholder.com/200x300?text=No+Image'
                  }} 
                  style={styles.detailsImage} 
                />
                
                <Text style={styles.detailsTitle}>{selectedShow.title}</Text>
                
                <View style={styles.detailsType}>
                  <Text style={[
                    styles.detailsTypeLabel, 
                    {color: selectedShow.type === 'anime' ? COLORS.quaternary : COLORS.tertiary}
                  ]}>
                    {selectedShow.type === 'anime' ? '🍡 Anime' : '🧋 K-Drama'}
                  </Text>
                </View>
                
                <Text style={styles.detailsOverviewTitle}>Overview</Text>
                <Text style={styles.detailsOverview}>
                  {selectedShow.overview || 'No overview available'}
                </Text>
                
                <TouchableOpacity 
                  style={styles.detailsAddButton}
                  onPress={() => {
                    addToTrending(selectedShow);
                    setShowDetailsModal(false);
                  }}
                  disabled={trendingShows.some(show => show.id === selectedShow.id) || isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : trendingShows.some(show => show.id === selectedShow.id) ? (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                      <Text style={styles.detailsAddButtonText}>Already in trending</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="add-circle" size={16} color="#FFF" />
                      <Text style={styles.detailsAddButtonText}>Add to Trending</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#888',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  emptySubText: {
    marginTop: 8,
    fontSize: 14,
    color: '#888',
  },
  trendingList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  trendingCard: {
    flexDirection: 'row',
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    marginBottom: 12,
    padding: 8,
    alignItems: 'center',
  },
  orderNumber: {
    width: 24,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#888',
    marginRight: 8,
    textAlign: 'center',
  },
  trendingCardImage: {
    width: 60,
    height: 90,
    borderRadius: 4,
  },
  trendingCardContent: {
    flex: 1,
    marginLeft: 12,
  },
  trendingCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  trendingCardType: {
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  trendingCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderButton: {
    padding: 8,
    marginRight: 4,
  },
  removeButton: {
    padding: 8,
    marginLeft: 'auto',
  },
  searchResultsList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  searchResultCard: {
    flexDirection: 'row',
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    marginBottom: 12,
    padding: 8,
  },
  resultCardImage: {
    width: 80,
    height: 120,
    borderRadius: 4,
  },
  resultCardContent: {
    flex: 1,
    marginLeft: 12,
  },
  resultCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  resultCardType: {
    marginBottom: 4,
  },
  resultCardDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 4,
  },
  alreadyAddedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  alreadyAddedText: {
    fontSize: 12,
    color: COLORS.secondary,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    padding: 16,
  },
  modalCloseButton: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  showDetails: {
    alignItems: 'center',
  },
  detailsImage: {
    width: 160,
    height: 240,
    borderRadius: 8,
    marginBottom: 16,
  },
  detailsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  detailsType: {
    marginBottom: 16,
  },
  detailsTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailsOverviewTitle: {
    alignSelf: 'flex-start',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  detailsOverview: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  detailsAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
    width: '100%',
  },
  detailsAddButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 8,
  },
}); 