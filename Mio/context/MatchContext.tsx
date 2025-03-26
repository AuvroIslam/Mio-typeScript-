import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  increment,
  Timestamp,
  DocumentData,
  DocumentReference,
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { useAuth } from './AuthContext';
import { useFavorites } from './FavoritesContext';
import { useRegistration } from './RegistrationContext';
import * as Haptics from 'expo-haptics';

// Constants
const MATCH_THRESHOLD = 3;
const SUPER_MATCH_THRESHOLD = 7;

// Define cooldown constants
const COOLDOWN_MINUTES = {
  FIRST: 1,   // 1 minute for first search
  SECOND: 2,  // 2 minutes after second search
  THIRD: 5    // 5 minutes after third and subsequent searches
};

// Types
export type MatchLevel = 'match' | 'superMatch';

export interface MatchData {
  userId: string;
  displayName: string;
  profilePic: string;
  matchLevel: MatchLevel;
  commonShowIds: string[];
  matchTimestamp: Timestamp;
  age?: number | string;
  location?: string;
  gender?: string;
}

interface ShowUserEntry {
  userId: string;
  timestamp: Timestamp;
}

interface MatchShowData {
  showId: string;
  [key: string]: any; // Add other properties as needed
}

interface MatchContext {
  matches: MatchData[];
  isSearching: boolean;
  cooldownEndTime: Date | null;
  searchMatches: () => Promise<number>;
  remainingTimeString: string;
  lastSearchTime: Date | null;
  isLoading: boolean;
  findMatches: () => Promise<void>;
  canSearch: boolean;
  formatTime: (seconds: number) => string;
  error: string | null;
  unmatchUser: (userId: string) => Promise<void>;
  loadPersistedMatches: () => Promise<void>;
}

interface MatchContextProviderProps {
  children: ReactNode;
}

const MatchContext = createContext<MatchContext | undefined>(undefined);

export const useMatch = () => {
  const context = useContext(MatchContext);
  if (!context) {
    throw new Error('useMatch must be used within a MatchContextProvider');
  }
  return context;
};

export const MatchContextProvider: React.FC<MatchContextProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const { registrationData } = useRegistration();
  const { userFavorites } = useFavorites();
  
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [cooldownEndTime, setCooldownEndTime] = useState<Date | null>(null);
  const [remainingTimeString, setRemainingTimeString] = useState<string>('');
  const [lastSearchTime, setLastSearchTime] = useState<Date | null>(null);
  const [searchCount, setSearchCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load matches when the user changes
  useEffect(() => {
    if (user) {
      loadPersistedMatches();
      loadUserSearchData();
    } else {
      setMatches([]);
    }
  }, [user]);
  
  // Update cooldown timer
  useEffect(() => {
    if (cooldownEndTime) {
      const interval = setInterval(() => {
        const now = new Date();
        const remainingMs = cooldownEndTime.getTime() - now.getTime();
        
        if (remainingMs <= 0) {
          setCooldownEndTime(null);
          setRemainingTimeString('');
          clearInterval(interval);
        } else {
          const remainingSeconds = Math.ceil(remainingMs / 1000);
          const minutes = Math.floor(remainingSeconds / 60);
          const seconds = remainingSeconds % 60;
          setRemainingTimeString(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [cooldownEndTime]);

  // Format time helper function
  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);
  
  const loadUserSearchData = useCallback(async () => {
    if (!user) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        
        // Load match search count
        if (data.matchSearchCount !== undefined) {
          setSearchCount(data.matchSearchCount);
        } else {
          setSearchCount(0);
        }
        
        // Load last search time and cooldown
        if (data.lastMatchSearch) {
          const lastSearch = data.lastMatchSearch.toDate();
          setLastSearchTime(lastSearch);
          
          if (data.cooldownEndTime) {
            const cooldownEnd = data.cooldownEndTime.toDate();
            const now = new Date();
            
            if (cooldownEnd > now) {
              setCooldownEndTime(cooldownEnd);
            } else {
              // If cooldown has passed, reset search count if it's been more than 24 hours
              const hoursSinceLastSearch = (now.getTime() - lastSearch.getTime()) / (1000 * 60 * 60);
              
              if (hoursSinceLastSearch > 24 && data.matchSearchCount > 0) {
                setSearchCount(0);
                await updateDoc(userRef, {
                  matchSearchCount: 0
                });
              }
            }
          }
        }
      }
    } catch (error) {
      // Silent error handling
    }
  }, [user]);
  
  const loadPersistedMatches = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists() && userDoc.data().matches) {
        const userMatches = userDoc.data().matches || [];
        setMatches(userMatches);
      } else {
        setMatches([]);
      }
    } catch (error) {
      setError('Failed to load your matches');
    } finally {
      setIsLoading(false);
    }
  }, [user]);
  
  const setCooldown = useCallback(async () => {
    if (!user) return;
    
    try {
      // Increment search count
      const newSearchCount = searchCount + 1;
      
      // Calculate cooldown time based on search count
      let cooldownMinutes;
      if (newSearchCount === 1) {
        cooldownMinutes = COOLDOWN_MINUTES.FIRST;
      } else if (newSearchCount === 2) {
        cooldownMinutes = COOLDOWN_MINUTES.SECOND;
      } else {
        cooldownMinutes = COOLDOWN_MINUTES.THIRD;
      }
      
      // Calculate cooldown end time
      const now = new Date();
      const cooldownEnd = new Date(now.getTime() + cooldownMinutes * 60 * 1000);
      
      // Update state
      setCooldownEndTime(cooldownEnd);
      setLastSearchTime(now);
      setSearchCount(newSearchCount);
      
      // Update Firestore with a single write operation
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        matchSearchCount: newSearchCount,
        lastMatchSearch: now,
        cooldownEndTime: cooldownEnd
      });
    } catch (error) {
      // Silent error handling
    }
  }, [user, searchCount]);
  
  const updateShowUsers = useCallback(async (showId: string) => {
    if (!user) return;
    
    try {
      const showUserRef = doc(db, 'showUsers', showId);
      const showUserDoc = await getDoc(showUserRef);
      
      const now = Timestamp.now();
      
      if (showUserDoc.exists()) {
        const data = showUserDoc.data();
        const users = data.users || [];
        
        // Check if user is already in the list
        const userExists = users.some((u: any) => u.userId === user.uid);
        
        if (userExists) {
          // User exists, update timestamp
          await updateDoc(showUserRef, {
            users: users.map((u: any) => 
              u.userId === user.uid ? { userId: user.uid, timestamp: now } : u
            )
          });
        } else {
          // User doesn't exist, add to list
          await updateDoc(showUserRef, {
            users: [...users, { userId: user.uid, timestamp: now }]
          });
        }
      } else {
        // Document doesn't exist, create it
        await setDoc(showUserRef, {
          showId,
          users: [{ userId: user.uid, timestamp: now }]
        });
      }
    } catch (error) {
      // Silent error handling
    }
  }, [user]);
  
  const addMatchToBothUsers = useCallback(async (currentUser: string, matchedUser: string, matchData: MatchData, otherUserMatchData: MatchData) => {
    try {
      // Update current user's matches
      const currentUserRef = doc(db, 'users', currentUser);
      await updateDoc(currentUserRef, {
        matches: arrayUnion(matchData)
      });
      
      // Update matched user's matches
      const matchedUserRef = doc(db, 'users', matchedUser);
      await updateDoc(matchedUserRef, {
        matches: arrayUnion(otherUserMatchData)
      });
      
      return true;
    } catch (error) {
      return false;
    }
  }, []);
  
  const areUsersMatched = useCallback((userMatches: MatchData[], matchedUserId: string): boolean => {
    return userMatches.some(match => match.userId === matchedUserId);
  }, []);
  
  const unmatchUser = useCallback(async (matchedUserId: string) => {
    if (!user) return;
    
    try {
      // Remove matched user from current user's matches
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && userDoc.data().matches) {
        const userMatches = userDoc.data().matches || [];
        const updatedMatches = userMatches.filter((match: MatchData) => match.userId !== matchedUserId);
        
        await updateDoc(userRef, {
          matches: updatedMatches
        });
      }
      
      // Remove current user from matched user's matches
      const matchedUserRef = doc(db, 'users', matchedUserId);
      const matchedUserDoc = await getDoc(matchedUserRef);
      
      if (matchedUserDoc.exists() && matchedUserDoc.data().matches) {
        const matchedUserMatches = matchedUserDoc.data().matches || [];
        const updatedMatchedUserMatches = matchedUserMatches.filter((match: MatchData) => match.userId !== user.uid);
        
        await updateDoc(matchedUserRef, {
          matches: updatedMatchedUserMatches
        });
      }
      
      // Update local state
      setMatches(prev => prev.filter(match => match.userId !== matchedUserId));
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setError('Failed to unmatch user');
      
      // Trigger haptic feedback for error
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [user]);
  
  const mergeMatches = useCallback((existingMatches: MatchData[], newMatches: MatchData[]): MatchData[] => {
    // Create a map of existing matches by userId for easy lookup
    const matchMap = new Map(existingMatches.map(match => [match.userId, match]));
    
    // Process each new match
    for (const newMatch of newMatches) {
      // If match already exists, only update if new match has more common shows or higher match level
      if (matchMap.has(newMatch.userId)) {
        const existingMatch = matchMap.get(newMatch.userId)!;
        
        // Update if the new match has more common shows
        if (newMatch.commonShowIds.length > existingMatch.commonShowIds.length) {
          matchMap.set(newMatch.userId, {
            ...existingMatch,
            matchLevel: newMatch.matchLevel,
            commonShowIds: newMatch.commonShowIds,
            matchTimestamp: newMatch.matchTimestamp
          });
        }
      } else {
        // Add new match
        matchMap.set(newMatch.userId, newMatch);
      }
    }
    
    // Convert map back to array
    return Array.from(matchMap.values());
  }, []);
  
  // Check if users match according to their preferences
  const checkMatchCriteria = useCallback((currentUserProfile: any, matchUserProfile: any): boolean => {
    // Check gender preferences
    const preferredGender = matchUserProfile.matchWith || 'everyone';
    const userGender = matchUserProfile.gender;
    const locationPreference = matchUserProfile.matchLocation || 'worldwide';
    const userLocation = matchUserProfile.location;
    
    // Check mutual preference matches
    const genderMatch = (currentUserProfile.matchWith === 'everyone' || currentUserProfile.matchWith === userGender) &&
                      (preferredGender === 'everyone' || preferredGender === currentUserProfile.gender);
    
    const locationMatch = (currentUserProfile.matchLocation !== 'local' || currentUserProfile.location === userLocation) &&
                        (locationPreference !== 'local' || userLocation === currentUserProfile.location);
    
    return genderMatch && locationMatch;
  }, []);
  
  const findMatches = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsSearching(true);
      setError('');
      
      // Update cooldown (if applicable)
      await setCooldown();
      
      // Get user profile and favorites
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        setError('User profile not found.');
        setIsSearching(false);
        return;
      }
      
      const userData = userDoc.data();
      const userProfile = userData.profile;
      
      // Exit if user profile is incomplete
      if (!userProfile || !userProfile.displayName || !userProfile.age || !userProfile.gender) {
        setError('Please complete your profile before searching for matches.');
        setIsSearching(false);
        return;
      }
      
      // Get existing matches to avoid duplicates
      const existingMatches = userData.matches || [];
      
      // Run the matching algorithm
      const showIds = (userFavorites.shows || []).map((id: string) => id);
      
      if (showIds.length === 0) {
        setError('Add some favorite shows first to find matches!');
        setIsSearching(false);
        return;
      }
      
      // For each show, find potential matches
      const allPotentialMatches: any[] = [];
      const matchUpdatePromises: Promise<any>[] = [];
      
      // Fetch all show users in parallel
      const showUserQueries = showIds.map((showId: string) => {
        const showUserRef = doc(db, 'showUsers', showId);
        return getDoc(showUserRef);
      });
      
      const showUserResults = await Promise.all(showUserQueries);
      
      // Process results
      const potentialUserMap = new Map();
      
      for (const showUserDoc of showUserResults) {
        if (showUserDoc.exists()) {
          const data = showUserDoc.data();
          const users = data.users || [];
          
          for (const userEntry of users) {
            // Skip current user
            if (userEntry.userId === user.uid) continue;
            
            // Skip users already matched or processed
            if (areUsersMatched(existingMatches, userEntry.userId)) continue;
            
            // Count occurrences
            if (potentialUserMap.has(userEntry.userId)) {
              potentialUserMap.set(userEntry.userId, potentialUserMap.get(userEntry.userId) + 1);
            } else {
              potentialUserMap.set(userEntry.userId, 1);
            }
          }
        }
      }
      
      // Fetch user details for potential matches
      const potentialUserIds = Array.from(potentialUserMap.keys());
      const newMatchesData: MatchData[] = [];
      
      // Batch user data fetching
      const userDataPromises = potentialUserIds.map(userId => getDoc(doc(db, 'users', userId)));
      const userDataResults = await Promise.all(userDataPromises);
      
      for (let i = 0; i < userDataResults.length; i++) {
        const userDataDoc = userDataResults[i];
        const userId = potentialUserIds[i];
        
        if (userDataDoc.exists()) {
          const matchUserData = userDataDoc.data();
          const matchUserProfile = matchUserData.profile;
          
          // Skip if profile is incomplete
          if (!matchUserProfile || !matchUserProfile.displayName || !matchUserProfile.gender) continue;
          
          // Check match criteria (gender/location preferences, etc.)
          if (!checkMatchCriteria(userProfile, matchUserProfile)) continue;
          
          // Find common shows
          const matchUserFavorites = matchUserProfile.favoriteShows || [];
          const commonShowIds = showIds.filter((id: string) => matchUserFavorites.includes(id));
          
          if (commonShowIds.length >= MATCH_THRESHOLD) {
            // Determine match level
            let matchLevel: MatchLevel = commonShowIds.length >= SUPER_MATCH_THRESHOLD ? 'superMatch' : 'match';
            
            // Create match object for current user
            const matchData: MatchData = {
              userId: userId,
              displayName: matchUserProfile.displayName,
              age: matchUserProfile.age || '',
              gender: matchUserProfile.gender || '',
              location: matchUserProfile.location || '',
              profilePic: matchUserProfile.profilePic || '',
              commonShowIds: commonShowIds,
              matchLevel: matchLevel,
              matchTimestamp: Timestamp.now()
            };
            
            // Create match object for the matched user
            const otherUserMatchData: MatchData = {
              userId: user.uid,
              displayName: userProfile.displayName,
              age: userProfile.age || '',
              gender: userProfile.gender || '',
              location: userProfile.location || '',
              profilePic: userProfile.profilePic || '',
              commonShowIds: commonShowIds,
              matchLevel: matchLevel,
              matchTimestamp: Timestamp.now()
            };
            
            newMatchesData.push(matchData);
            
            // Add match to both users
            await addMatchToBothUsers(user.uid, userId, matchData, otherUserMatchData);
          }
        }
      }
      
      // Merge new matches with existing ones and update state
      const updatedMatches = mergeMatches(existingMatches, newMatchesData);
      
      // Update state with all matches
      setMatches(updatedMatches);
      
      // If no matches were found
      if (newMatchesData.length === 0 && existingMatches.length === 0) {
        setError('No matches found. Try adding more shows to your favorites!');
      }
      
    } catch (error) {
      setError('An error occurred while finding matches.');
    } finally {
      setIsSearching(false);
    }
  }, [user, userFavorites, areUsersMatched, setCooldown, checkMatchCriteria, mergeMatches, addMatchToBothUsers]);
  
  const searchMatches = useCallback(async () => {
    if (!user) return 0;
    
    setIsSearching(true);
    
    try {
      // Get current match count to calculate new matches later
      const initialMatchCount = matches.length;
      
      // Set cooldown first to ensure it's always updated
      await setCooldown();
      
      // Update showUsers collection for all favorite shows
      const favoriteShowIds = userFavorites.shows || [];
      
      // Update showUsers in parallel for better performance
      await Promise.all(favoriteShowIds.map(showId => updateShowUsers(showId)));
      
      // Find matches
      await findMatches();
      
      // Calculate new matches - make sure we're using the updated match count
      const newMatchCount = matches.length - initialMatchCount;
      
      // Trigger haptic feedback for success
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      return newMatchCount > 0 ? newMatchCount : 0;
    } catch (error) {
      // Trigger haptic feedback for error
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return 0;
    } finally {
      setIsSearching(false);
    }
  }, [user, userFavorites, setCooldown, updateShowUsers, findMatches, matches.length]);
  
  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    matches,
    isSearching,
    cooldownEndTime,
    searchMatches,
    remainingTimeString,
    lastSearchTime,
    isLoading,
    findMatches,
    canSearch: cooldownEndTime === null,
    formatTime,
    error,
    unmatchUser,
    loadPersistedMatches
  }), [
    matches, 
    isSearching, 
    cooldownEndTime, 
    searchMatches, 
    remainingTimeString, 
    lastSearchTime,
    isLoading,
    findMatches,
    cooldownEndTime,
    formatTime,
    error,
    unmatchUser,
    loadPersistedMatches
  ]);
  
  return (
    <MatchContext.Provider value={contextValue}>
      {children}
    </MatchContext.Provider>
  );
}; 