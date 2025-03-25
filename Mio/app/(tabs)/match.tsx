import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
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
import { BlurView } from 'expo-blur';
import UserProfileScreen from '../(common)/userProfile';

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
  };
  onPress: () => void;
  onUnmatch: (userId: string) => void;
}

const MatchCard: React.FC<MatchCardProps> = ({ match, onPress, onUnmatch }) => {
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
          onPress: () => onUnmatch(match.userId),
          style: "destructive"
        }
      ]
    );
  };

  return (
    <TouchableOpacity
      style={styles.matchCard}
      activeOpacity={0.9}
      onPress={onPress}
    >
      <Image
        source={{ uri: match.profilePic || 'https://via.placeholder.com/400x600?text=No+Image' }}
        style={styles.matchImage}
      />
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
      
      {/* Unmatch Button */}
      <TouchableOpacity 
        style={styles.unmatchButton}
        onPress={confirmUnmatch}
      >
        <Ionicons name="close-circle" size={24} color="#FFF" />
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
    lastSearchTime,
    isLoading,
    error,
    unmatchUser,
    loadPersistedMatches
  } = useMatch();
  
  const { userFavorites } = useFavorites();
  const [noFavorites, setNoFavorites] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  
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
    
    try {
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
        commonShows: match.commonShowIds.join(',')
      }
    });
  };
  
  const handleUnmatch = async (userId: string) => {
    try {
      await unmatchUser(userId);
    } catch (error) {
      // Error already handled by the context
    }
  };
  
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
    
    return (
      <FlatList
        data={matches}
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
    <View style={styles.container}>
      {renderLoadingModal()}
      
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
    </View>
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
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
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
    backgroundColor: 'rgba(255,105,180,0.9)',
  },
  superMatchBadge: {
    backgroundColor: 'rgba(255,215,0,0.9)',
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
    backgroundColor: 'rgba(255, 59, 78, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.8,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  modalText: {
    marginTop: 15,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondary,
    textAlign: 'center',
  },
});