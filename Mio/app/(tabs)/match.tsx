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
  Alert
} from 'react-native';
import { router } from 'expo-router';
import { useMatch } from '../../context/MatchContext';
import { useFavorites } from '../../context/FavoritesContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';


import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85;
const CARD_HEIGHT = CARD_WIDTH * 1.3;

interface MatchCardProps {
  match: {
    userId: string;
    displayName: string;
    profilePic: string;
    matchLevel: string;
    commonShowIds: string[];
    age?: number | string;
    location?: string;
    gender?: string;
    matchTimestamp?: any; // Add timestamp for when the match occurred
  };
  onPress: () => void;
  onUnmatch: (userId: string) => Promise<boolean>;
}

const MatchCard: React.FC<MatchCardProps> = ({ match, onPress, onUnmatch }) => {
  const [isUnmatching, setIsUnmatching] = useState(false);
  
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
    
    // Convert Firestore timestamp to Date if necessary
    const matchDate = match.matchTimestamp.toDate ? 
      match.matchTimestamp.toDate() : 
      new Date(match.matchTimestamp);
    
    const now = new Date();
    const timeDiff = now.getTime() - matchDate.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    return hoursDiff < 24;
  };

  const shouldBlurImage = isNewMatch();

  return (
    <TouchableOpacity
      style={styles.matchCard}
      activeOpacity={0.9}
      onPress={onPress}
    >
      <View style={styles.imageContainer}>
        {shouldBlurImage ? (
          <View style={styles.blurContainer}>
            <Image
              source={{ uri: match.profilePic || 'https://via.placeholder.com/400x600?text=No+Image' }}
              style={[styles.matchImage]}
              blurRadius={40}
            />
          </View>
        ) : (
          <Image
            source={{ uri: match.profilePic || 'https://via.placeholder.com/400x600?text=No+Image' }}
            style={styles.matchImage}
          />
        )}
      </View>
      
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.matchGradient}
      />
      
      {/* Match Level Badge */}
      <View style={[
        styles.matchBadge,
        match.matchLevel === 'superMatch' ? styles.superMatchBadge : styles.regularMatchBadge
      ]}>
        <Ionicons 
          name={match.matchLevel === 'superMatch' ? 'star' : 'heart'} 
          size={16} 
          color="#FFF" 
        />
        <Text style={styles.matchBadgeText}>
          {match.matchLevel === 'superMatch' ? 'Super Match!' : 'Match!'}
        </Text>
      </View>
      
      {/* Unlock timer text */}
      {shouldBlurImage && (
        <View style={styles.unlockTimerContainer}>
          <Text style={styles.unlockTimerText}>Unlocks after 24h of matching</Text>
        </View>
      )}
      
      {/* Unmatch Button */}
      <TouchableOpacity 
        style={[styles.unmatchButton, isUnmatching && styles.unmatchButtonDisabled]}
        onPress={confirmUnmatch}
        disabled={isUnmatching}
      >
        {isUnmatching ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Ionicons name="close-circle" size={24} color="#FFF" />
        )}
      </TouchableOpacity>
      
      <View style={styles.matchInfoContainer}>
        <Text style={styles.matchName}>
          {match.displayName}, {match.age || '?'}
        </Text>
        
        <Text style={styles.matchLocation}>
          {match.location || 'Unknown location'}
        </Text>
        
        <View style={styles.commonShowsContainer}>
          <Text style={styles.commonShowsText}>
            {match.commonShowIds.length} shows in common
          </Text>
        </View>
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
  
  const { userFavorites } = useFavorites();
  const [noFavorites, setNoFavorites] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [newMatchCount, setNewMatchCount] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [matchesBeforeSearch, setMatchesBeforeSearch] = useState(0);
  
  // Animation values
  const fadeAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(0.9))[0];
  
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
    
    // Start animation when matches are loaded
    if (matches && matches.length > 0) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [matches]);
  
  const handleSearch = async () => {
    // Reset animation values
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.9);
    
    // Store the current match count to calculate new matches later
    const currentMatchCount = matches.length;
    setMatchesBeforeSearch(currentMatchCount);
    
    
    try {
      // Search for matches - the useEffect will handle showing notifications
      await searchMatches();
    } catch (error) {
      // Error already handled by the context
    }
  };
  
  const navigateToUserProfile = (match: any) => {
    router.push({
      pathname: '/(common)/userProfile',
      params: {
        userId: match.userId,
        matchLevel: match.matchLevel,
        commonShows: match.commonShowIds.join(','),
        favoriteShows: match.favoriteShowIds ? match.favoriteShowIds.join(',') : '',
        matchTimestamp: match.matchTimestamp ? match.matchTimestamp.toDate ? match.matchTimestamp.toDate().toISOString() : match.matchTimestamp.toString() : ''
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
    
    if (isFirstLoad) {
      return (
        <View style={styles.emptyStateContainer}>
          <Ionicons name="people-outline" size={100} color={COLORS.secondary} />
          <Text style={styles.emptyStateTitle}>Find Your Matches</Text>
          <Text style={styles.emptyStateText}>
            Connect with others who share your taste in shows!
          </Text>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={isSearching || !!cooldownEndTime}
          >
            <Text style={styles.searchButtonText}>Search Matches</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
  return (
      <View style={styles.emptyStateContainer}>
        <Ionicons name="search-outline" size={100} color={COLORS.secondary} />
        <Text style={styles.emptyStateTitle}>No Matches Found</Text>
        <Text style={styles.emptyStateText}>
          We couldn't find anyone with similar show preferences right now. Try again later!
        </Text>
        </View>
    );
  };
  
  const renderCooldownTimer = () => {
    if (!cooldownEndTime) return null;
    
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
    if (!matches || matches.length === 0) {
      return renderEmptyState();
    }
    
    // Filter out matches that have chattingWith set to true
    const availableMatches = matches.filter(match => !match.chattingWith);
    
    if (availableMatches.length === 0) {
      return (
        <View style={styles.emptyStateContainer}>
          <Ionicons name="chatbubble-outline" size={100} color={COLORS.secondary} />
          <Text style={styles.emptyStateTitle}>All Matches in Chat</Text>
          <Text style={styles.emptyStateText}>
            All your matches have started conversations. Check your inbox to continue chatting!
          </Text>
          <TouchableOpacity
            style={styles.exploreButton}
            onPress={() => router.push('/(tabs)/inbox')}
          >
            <Text style={styles.exploreButtonText}>Go to Inbox</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    return (
      <FlatList
        data={availableMatches}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => (
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            }}
          >
            <MatchCard 
              match={item} 
              onPress={() => navigateToUserProfile(item)}
              onUnmatch={handleUnmatch}
            />
          </Animated.View>
        )}
        contentContainerStyle={styles.matchList}
        showsVerticalScrollIndicator={false}
      />
    );
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
        {renderMatchList()}
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
  commonShowsContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  commonShowsText: {
    color: '#FFF',
    fontWeight: '500',
    fontSize: 14,
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