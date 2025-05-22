import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  
  Image, 
  ActivityIndicator,
  Dimensions,
  Animated,
  FlatList,
  Modal,
  Alert,
  ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { useMatch } from '../../context/MatchContext';
import { useFavorites } from '../../context/FavoritesContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { MatchData } from '../../types/match';


import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85;
const CARD_HEIGHT = CARD_WIDTH * 1.3;

interface MatchCardProps {
  match: MatchData;
  onPress: () => void;
  onUnmatch: (userId: string) => Promise<boolean>;
}

const MatchCard: React.FC<MatchCardProps> = ({ match, onPress, onUnmatch }) => {
  const [isUnmatching, setIsUnmatching] = useState(false);
  
  // Import styles from the parent component
  const { matchCard, imageContainer, blurContainer, matchImage, matchGradient, 
          matchBadge, superMatchBadge, regularMatchBadge, matchBadgeText, 
          unlockTimerContainer, unlockTimerText, unmatchButton, unmatchButtonDisabled,
          matchInfoContainer, matchName, matchLocation } = styles;
  
  // Add debugging

  
  const confirmUnmatch = () => {
    Alert.alert(
      "Unmatch",
      `Are you sure you want to unmatch with ${match.displayName}?`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        { 
          text: "Unmatch", 
          onPress: () => {
            setIsUnmatching(true);
            onUnmatch(match.userId)
              .catch(err => console.error("Error in unmatch:", err))
              .finally(() => setIsUnmatching(false));
          },
          style: "destructive"
        }
      ]
    );
  };

  // Check if match is less than 24 hours old
  const isNewMatch = () => {
    if (!match.matchTimestamp) return false;
    
    const matchDate = match.matchTimestamp.toDate();
    
    const now = new Date();
    const timeDiff = now.getTime() - matchDate.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    return hoursDiff < 24;
  };

  const shouldBlurImage = isNewMatch();

  return (
    <TouchableOpacity
      style={[matchCard, {borderWidth: 1, borderColor: '#ddd'}]} // Use local variable reference
      activeOpacity={0.9}
      onPress={onPress}
    >
      <View style={imageContainer}>
        {shouldBlurImage ? (
          <View style={blurContainer}>
            <Image
              source={{ uri: match.profilePic || 'https://via.placeholder.com/400x600?text=No+Image' }}
              style={[matchImage]}
              blurRadius={40}
            />
          </View>
        ) : (
          <Image
            source={{ uri: match.profilePic || 'https://via.placeholder.com/400x600?text=No+Image' }}
            style={matchImage}
            onError={() => console.log(`[match.tsx] Image failed to load for ${match.displayName}`)}
          />
        )}
      </View>
      
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={matchGradient}
      />
      
      {/* Match Level Badge */}
      <View style={[
        matchBadge,
        match.matchLevel === 'superMatch' ? superMatchBadge : regularMatchBadge
      ]}>
        <Ionicons 
          name={match.matchLevel === 'superMatch' ? 'star' : 'heart'} 
          size={16} 
          color="#FFF" 
        />
        <Text style={matchBadgeText}>
          {match.matchLevel === 'superMatch' ? 'Super Match!' : 'Match!'}
        </Text>
      </View>
      
      {/* Unlock timer text */}
      {shouldBlurImage && (
        <View style={unlockTimerContainer}>
          <Text style={unlockTimerText}>Unlocks after 24h of matching</Text>
        </View>
      )}
      
      {/* Unmatch Button */}
      <TouchableOpacity 
        style={[unmatchButton, isUnmatching && unmatchButtonDisabled]}
        onPress={confirmUnmatch}
        disabled={isUnmatching}
      >
        {isUnmatching ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Ionicons name="close-circle" size={24} color="#FFF" />
        )}
      </TouchableOpacity>
      
      <View style={matchInfoContainer}>
        <Text style={matchName}>
          {String(match.displayName || '')}{match.age ? `, ${String(match.age)}` : ''}
        </Text>
        
        <Text style={matchLocation}>
          {String(match.location || 'Unknown location')}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default function MatchScreen() {
  const { 
    matches, 
    isSearching, 
    cooldownEndTime, 
    searchMatches, 
    remainingTimeString,
    isLoading,
    error,
    unmatchUser,
  } = useMatch();
  
  // Log cooldown state changes whenever they happen
  
  
  const { userFavorites } = useFavorites();
  const [noFavorites, setNoFavorites] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [newMatchCount, setNewMatchCount] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [matchesBeforeSearch, setMatchesBeforeSearch] = useState(0);
  
  // Animation values - ENSURE PROPER INITIALIZATION
  // Use direct creation instead of useState to ensure stable references
  const fadeAnim = new Animated.Value(1);
  const scaleAnim = new Animated.Value(1);
  
  useEffect(() => {
    // Check if user has favorites
    if (userFavorites?.shows) {
      setNoFavorites(userFavorites.shows.length === 0);
    } else {
      setNoFavorites(true);
    }
  }, [userFavorites]);
  
  useEffect(() => {
    if (isFirstLoad && matches && matches.length > 0) {
      setIsFirstLoad(false);
    }
    
    // Ensure animation happens any time matches change (not just on first load)
    if (matches && matches.length > 0) {
      // Reset animation values first to ensure animation runs
      fadeAnim.setValue(0.3);
      scaleAnim.setValue(0.95);
      
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        
      });
    }
  }, [matches, fadeAnim, scaleAnim]);
  
  const handleSearch = async () => {

    
    // Reset animation values for a smooth transition
    fadeAnim.setValue(0.5);
    scaleAnim.setValue(0.95);
    
    // Store the current match count to calculate new matches later
    const currentMatchCount = matches.length;
    setMatchesBeforeSearch(currentMatchCount);
    
    try {
      // Search for matches - the useEffect will handle showing notifications
      const newMatchesCount = await searchMatches();

      
      // Force check cooldown again after a small delay to ensure context has updated
      setTimeout(() => {
        console.log(`[COOLDOWN] Delayed check - cooldownEndTime: ${cooldownEndTime ? cooldownEndTime.toISOString() : 'null'}`);
      }, 500);
    } catch (error) {
      console.error('[COOLDOWN] Error in handleSearch:', error);
    }
  };
  
  const navigateToUserProfile = (match: MatchData) => {
    router.push({
      pathname: '/(common)/userProfile',
      params: {
        userId: match.userId,
        matchLevel: match.matchLevel,
        favoriteShows: match.favoriteShowIds ? match.favoriteShowIds.join(',') : '',
        matchTimestamp: match.matchTimestamp ? match.matchTimestamp.toDate().toISOString() : ''
      }
    });
  };
  
  const handleUnmatch = async (userId: string) => {
    try {
      await unmatchUser(userId);
      return true;
    } catch (error) {
      console.error('Error in handleUnmatch:', error);
      // Show an alert to the user
      Alert.alert(
        "Unmatch Failed",
        "There was a problem unmatching this user. Please try again later.",
        [{ text: "OK" }]
      );
      throw error; // Re-throw to be caught in the component
    }
  };
  
  // Add a useEffect to update newMatchCount when matches change after search
  useEffect(() => {
    if (isSearching === false && matchesBeforeSearch > 0) {
      // Calculate new matches after search completes
      const newMatches = matches.length - matchesBeforeSearch;
      
      if (newMatches !== newMatchCount) {
        setNewMatchCount(newMatches);
        
        // Show result modal if we have any result (positive or zero)
        setShowResultModal(true);
        setTimeout(() => {
          setShowResultModal(false);
        }, 5000);
      }
      
      // Reset matchesBeforeSearch after processing
      setMatchesBeforeSearch(0);
    }
  }, [matches, isSearching, matchesBeforeSearch, newMatchCount]);
  
  // Render loading modal
  const renderLoadingModal = () => {
    return (
      <Modal
        visible={isSearching}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color={COLORS.secondary} />
            <Text style={styles.modalText}>Searching for matches...</Text>
          </View>
        </View>
      </Modal>
    );
  };
  
  // Render results modal
  const renderResultsModal = () => {
    return (
      <Modal
        visible={showResultModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons 
              name={newMatchCount > 0 ? "heart" : "search"} 
              size={50} 
              color={newMatchCount > 0 ? COLORS.secondary : "#666"} 
            />
            <Text style={styles.modalTitle}>
              {newMatchCount > 0 ? "Success!" : "Search Complete"}
            </Text>
            <Text style={styles.modalText}>
              {newMatchCount > 0 
                ? `Found ${newMatchCount} new ${newMatchCount === 1 ? 'match' : 'matches'}!` 
                : "No new matches found this time."}
            </Text>
            {newMatchCount > 0 && (
              <TouchableOpacity 
                style={styles.viewMatchesButton}
                onPress={() => {
                  setShowResultModal(false);
                }}
              >
                <Text style={styles.viewMatchesButtonText}>View Matches</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  };
  
  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyStateContainer}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.emptyStateText}>Finding your matches...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.emptyStateContainer}>
          <MaterialCommunityIcons 
            name="alert-circle-outline" 
            size={100} 
            color={COLORS.secondary} 
          />
          <Text style={styles.emptyStateTitle}>Oops!</Text>
          <Text style={styles.emptyStateText}>{error}</Text>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={isSearching || !!cooldownEndTime}
          >
            <Text style={styles.searchButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (noFavorites) {
      return (
        <View style={styles.emptyStateContainer}>
          <MaterialCommunityIcons 
            name="heart-off-outline" 
            size={100} 
            color={COLORS.secondary} 
          />
          <Text style={styles.emptyStateTitle}>No Favorites Yet</Text>
          <Text style={styles.emptyStateText}>
            Add some shows to your favorites first to find your perfect matches!
          </Text>
          <TouchableOpacity
            style={styles.exploreButton}
            onPress={() => router.push('/(tabs)/home')}
          >
            <Text style={styles.exploreButtonText}>Explore Shows</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    // Consolidated state for when no matches are available to be shown
    // This covers: First load, no matches found ever, or all matches are in chat.
    return (
      <View style={styles.emptyStateContainer}>
        <Ionicons name="search-outline" size={100} color={COLORS.secondary} />
        <Text style={styles.emptyStateTitle}>
          {isFirstLoad ? "Find Your Matches" : "No Matches to Show"}
        </Text>
        <Text style={styles.emptyStateText}>
          {isFirstLoad
            ? "Search to connect with others who share your taste!"
            : "Update your favorites list or search again to find new matches."
          }
        </Text>
        <TouchableOpacity
          style={[
            styles.searchButton,
            (isSearching || !!cooldownEndTime || noFavorites) && styles.searchButtonDisabled
          ]}
          onPress={handleSearch}
          disabled={isSearching || !!cooldownEndTime || noFavorites}
        >
          <Text style={styles.searchButtonText}>Search Matches</Text>
        </TouchableOpacity>
      </View>
    );
  };
  
  const renderCooldownTimer = () => {
    if (!cooldownEndTime) {
      
      return null;
    }
    
    
    return (
      <View style={styles.cooldownContainer}>
        <Ionicons name="time-outline" size={20} color={COLORS.secondary} />
        <Text style={styles.cooldownText}>
          Next search available in: {remainingTimeString}
        </Text>
      </View>
    );
  };
  
  const renderMatchList = () => {
    // Filter out matches that have chattingWith set to true
    const availableMatches = matches.filter(match => !match.chattingWith);
    
    // If no matches are available to display (either none exist or all are chatting),
    // show the consolidated empty state.
    if (availableMatches.length === 0) {
      return renderEmptyState(); 
    }
    
    // SIMPLE RENDERING WITH SCROLLING SUPPORT
    if (availableMatches.length > 0) {
      // Use this approach to prevent text leaking into View components
      const matchCards = availableMatches.map(item => (
        <MatchCard 
          key={item.userId}
          match={item} 
          onPress={() => navigateToUserProfile(item)}
          onUnmatch={handleUnmatch}
        />
      ));
      
      return (
        <ScrollView 
          contentContainerStyle={{padding: 20}}
          showsVerticalScrollIndicator={true}
        >
          {matchCards}
          <View style={{height: 40}} />
        </ScrollView>
      );
    }
    
    // If we somehow get here, show empty state as fallback
    return renderEmptyState();
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderLoadingModal()}
      {renderResultsModal()}
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Match</Text>
        <TouchableOpacity
          style={[
            styles.searchButtonSmall,
            (isSearching || cooldownEndTime || noFavorites) && styles.searchButtonDisabled
          ]}
          onPress={handleSearch}
          disabled={isSearching || !!cooldownEndTime || noFavorites}
        >
          {isSearching ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="search" size={16} color="#FFF" />
              <Text style={styles.searchButtonSmallText}>Search</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      
      {renderCooldownTimer()}
      
      <View style={styles.contentContainer}>
        <View style={{ flex: 1, backgroundColor: "#f8f8f8" }}>
          {renderMatchList()}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.darkestMaroon,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 10,
  },
  matchList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  cooldownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    borderRadius: 10,
    marginTop: 10,
  },
  cooldownText: {
    fontSize: 14,
    color: COLORS.secondary,
    fontWeight: '600',
    marginLeft: 8,
  },
  searchButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.secondary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  searchButtonSmallText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  matchCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    backgroundColor: '#fff',
    alignSelf: 'center',
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  matchImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  matchGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  matchBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  regularMatchBadge: {
    backgroundColor: COLORS.secondary,
  },
  superMatchBadge: {
    backgroundColor: COLORS.secondary,
  },
  matchBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 5,
    fontSize: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  matchInfoContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  matchName: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  matchLocation: {
    color: '#FFF',
    fontSize: 16,
    marginBottom: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  searchButton: {
    backgroundColor: COLORS.secondary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  exploreButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
    alignItems: 'center',
  },
  exploreButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  unmatchButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.darkestMaroon,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  unmatchButtonDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.85,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8
  },
  modalText: {
    marginTop: 15,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondary,
    textAlign: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginTop: 15,
    marginBottom: 8,
    textAlign: 'center',
  },
  viewMatchesButton: {
    backgroundColor: COLORS.secondary,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 25,
    width: '100%',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  viewMatchesButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  blurContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: 20,
  },
  unlockTimerContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 10,
  },
  unlockTimerText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
});