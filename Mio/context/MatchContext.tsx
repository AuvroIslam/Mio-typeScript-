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
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  favoriteShowIds: string[];
  matchTimestamp: Timestamp;
  age?: number | string;
  location?: string;
  gender?: string;
  chattingWith?: boolean; // Track if users are already in a conversation
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
  unmatchUser: (userId: string, isBlockAction?: boolean) => Promise<void>;
  loadPersistedMatches: () => Promise<void>;
  updateChattingWithStatus: (userId: string) => Promise<boolean>;
  blockUser: (userIdToBlock: string) => Promise<void>;
  unblockUser: (userIdToUnblock: string) => Promise<void>;
  blockedUsers: string[];
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
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  
  // Initialize Firebase Functions
  const functions = getFunctions();
  const callDeleteConversationData = httpsCallable(functions, 'deleteConversationData');
  
  // Load matches when the user changes
  useEffect(() => {
    if (user) {
      loadPersistedMatches();
      loadUserSearchData();
    } else {
      setMatches([]);
      setBlockedUsers([]);
      setCooldownEndTime(null);
      setLastSearchTime(null);
      setSearchCount(0);
    }
  }, [user]);
  
  // Set up AppState listener to handle background/foreground transitions
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      // When app comes to foreground from background/inactive state
      if (appState !== 'active' && nextAppState === 'active' && cooldownEndTime) {
        // Recalculate remaining time based on absolute end time
        updateTimeRemainingString();
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState, cooldownEndTime]);

  // Function to update time string based on absolute end time
  const updateTimeRemainingString = useCallback(() => {
    if (!cooldownEndTime) return;
    
    const now = new Date();
    const remainingMs = cooldownEndTime.getTime() - now.getTime();
    
    if (remainingMs <= 0) {
      setCooldownEndTime(null);
      setRemainingTimeString('');
    } else {
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      setRemainingTimeString(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }
  }, [cooldownEndTime]);
  
  // Update cooldown timer - now uses the updateTimeRemainingString function
  useEffect(() => {
    if (cooldownEndTime) {
      // Initial call to set the correct string
      updateTimeRemainingString();
      
      // Set up interval that updates while app is in foreground
      const interval = setInterval(() => {
        updateTimeRemainingString();
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [cooldownEndTime, updateTimeRemainingString]);

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
        const profile = data.profile || {};
        
        // Load block list
        setBlockedUsers(profile.blockedUsers || []);
        
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
      } else {
        // User doc doesn't exist, reset relevant states
        setBlockedUsers([]);
        setSearchCount(0);
        setLastSearchTime(null);
        setCooldownEndTime(null);
      }
    } catch (error) {
      console.error("Error loading user search data:", error);
      setError('Failed to load user settings.');
      // Reset states on error
      setBlockedUsers([]);
      setSearchCount(0);
      setLastSearchTime(null);
      setCooldownEndTime(null);
    }
  }, [user]);
  
  const loadPersistedMatches = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists() && userDoc.data().matches) {
        const userMatches = userDoc.data().matches || [];
        // Load all matches regardless of chattingWith state
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
      let newSearchCount = searchCount + 1;
      
      // Calculate cooldown time based on search count
      let cooldownMinutes;
      if (newSearchCount === 1) {
        cooldownMinutes = COOLDOWN_MINUTES.FIRST;
      } else if (newSearchCount === 2) {
        cooldownMinutes = COOLDOWN_MINUTES.SECOND;
      } else if (newSearchCount === 3) {
        cooldownMinutes = COOLDOWN_MINUTES.THIRD;
      } else {
        // Reset search count to 1 to restart the cycle after the third search
        // This ensures the pattern loops: 1min, 2min, 5min, 1min, 2min, 5min, etc.
        cooldownMinutes = COOLDOWN_MINUTES.FIRST;
        newSearchCount = 1;
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
      
      // Use setDoc with merge: true to efficiently add the user ID
      // It creates the doc if it doesn't exist, or adds the ID to the array if it does.
      // arrayUnion prevents duplicates.
        await setDoc(showUserRef, {
        showId: showId, // Optional: keep showId for clarity
        users: arrayUnion(user.uid)
      }, { merge: true });
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
  
  const updateChattingWithStatus = useCallback(async (matchedUserId: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Get the current user's document
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      // Get the matched user's document
      const matchedUserRef = doc(db, 'users', matchedUserId);
      const matchedUserDoc = await getDoc(matchedUserRef);
      
      if (!userDoc.exists() || !matchedUserDoc.exists()) {
        return false;
      }
      
      // Begin a batch update for atomic operations
      const batch = writeBatch(db);
      
      // Update current user's match with matched user
      const userMatches = userDoc.data().matches || [];
      const updatedUserMatches = userMatches.map((match: MatchData) => {
        if (match.userId === matchedUserId) {
          return {...match, chattingWith: true};
        }
        return match;
      });
      
      batch.update(userRef, { matches: updatedUserMatches });
      
      // Update matched user's match with current user
      const matchedUserMatches = matchedUserDoc.data().matches || [];
      const updatedMatchedUserMatches = matchedUserMatches.map((match: MatchData) => {
        if (match.userId === user.uid) {
          return {...match, chattingWith: true};
        }
        return match;
      });
      
      batch.update(matchedUserRef, { matches: updatedMatchedUserMatches });
      
      // Commit the batch
      await batch.commit();
      
      // Update local state - update the match in the state instead of filtering it out
      setMatches(prev => prev.map(match => 
        match.userId === matchedUserId 
          ? { ...match, chattingWith: true } 
          : match
      ));
      
      return true;
    } catch (error) {
      console.error('Error updating chattingWith status:', error);
      return false;
    }
  }, [user]);
  
  const unmatchUser = useCallback(async (matchedUserId: string, isBlockAction: boolean = false) => {
    if (!user) return;
    
    const userRef = doc(db, 'users', user.uid);
    const matchedUserRef = doc(db, 'users', matchedUserId);
    const cacheKey = `conversation_${user.uid}_${matchedUserId}`;
    const otherUserCacheKey = `conversation_${matchedUserId}_${user.uid}`;

    try {
        // Clear cache immediately to prevent reuse of old ID
        await AsyncStorage.removeItem(cacheKey);
        await AsyncStorage.removeItem(otherUserCacheKey);
        

        // 1. Remove match entries from both users' profiles
        const batch = writeBatch(db);

      const userDoc = await getDoc(userRef);
      if (userDoc.exists() && userDoc.data().matches) {
        const userMatches = userDoc.data().matches || [];
        const updatedMatches = userMatches.filter((match: MatchData) => match.userId !== matchedUserId);
            batch.update(userRef, { matches: updatedMatches });
      }
      
      const matchedUserDoc = await getDoc(matchedUserRef);
      if (matchedUserDoc.exists() && matchedUserDoc.data().matches) {
        const matchedUserMatches = matchedUserDoc.data().matches || [];
        const updatedMatchedUserMatches = matchedUserMatches.filter((match: MatchData) => match.userId !== user.uid);
            batch.update(matchedUserRef, { matches: updatedMatchedUserMatches });
        }

        await batch.commit();
       

        // 2. Update local state immediately
        setMatches(prev => prev.filter(match => match.userId !== matchedUserId));

        // 3. Call Cloud Function to delete conversation data (regardless of block action)
        try {
          console.log(`Calling deleteConversationData Cloud Function for otherUserId: ${matchedUserId}`);
          const result = await callDeleteConversationData({ otherUserId: matchedUserId });
          console.log("deleteConversationData result:", result.data);
        } catch (cfError: any) {
            console.error('Error calling deleteConversationData Cloud Function:', cfError);
            setError(`Unmatch successful, but failed to cleanup conversation data fully: ${cfError.message || cfError}`);
        }

        // 4. Haptic feedback (only if not part of a block action, blockUser will handle its own)
        if (!isBlockAction) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

    } catch (error: any) {
        console.error('Error in unmatchUser process:', error);
        setError(`Failed to unmatch user: ${error.message || error}`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        loadPersistedMatches(); // Reload matches on error
        throw error; // Re-throw if needed by caller
    }
  }, [user, callDeleteConversationData, loadPersistedMatches]);
  
  const blockUser = useCallback(async (userIdToBlock: string) => {
    if (!user || !userIdToBlock || blockedUsers.includes(userIdToBlock)) return; // Prevent self-block or re-blocking

   
    const userRef = doc(db, 'users', user.uid);

    try {
        // 1. Update Firestore profile.blockedUsers
        await updateDoc(userRef, {
            'profile.blockedUsers': arrayUnion(userIdToBlock)
        });
        

        // 2. Update local state
        setBlockedUsers(prev => [...prev, userIdToBlock]);

        // 3. Trigger unmatch logic (which now also calls the cleanup CF)
        await unmatchUser(userIdToBlock, true); // Pass true for isBlockAction
     

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
    } catch (error: any) {
        console.error(`Error blocking user ${userIdToBlock}:`, error);
        setError(`Failed to block user: ${error.message || error}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // Attempt to rollback local state if Firestore update failed but local state changed
        setBlockedUsers(prev => prev.filter(id => id !== userIdToBlock));
    }
  }, [user, unmatchUser, blockedUsers]);
  
  const unblockUser = useCallback(async (userIdToUnblock: string) => {
      if (!user || !userIdToUnblock || !blockedUsers.includes(userIdToUnblock)) return; // Can't unblock if not blocked

    
      const userRef = doc(db, 'users', user.uid);

      try {
          // 1. Update Firestore profile.blockedUsers
          await updateDoc(userRef, {
              'profile.blockedUsers': arrayRemove(userIdToUnblock)
          });
         

          // 2. Update local state
          setBlockedUsers(prev => prev.filter(id => id !== userIdToUnblock));

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      } catch (error: any) {
          console.error(`Error unblocking user ${userIdToUnblock}:`, error);
          setError(`Failed to unblock user: ${error.message || error}`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          // Attempt to rollback local state if Firestore update failed but local state changed
          setBlockedUsers(prev => [...prev, userIdToUnblock]); // Add back if it was removed locally
      }
  }, [user, blockedUsers]);
  
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
      
      // No need to call setCooldown here, searchMatches does it.
      
      // Get current user profile, favorites, and block list
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        setError('User profile not found.');
        setIsSearching(false);
        return;
      }
      
      const userData = userDoc.data();
      const userProfile = userData.profile;
      const currentUserBlockedList = userProfile?.blockedUsers || []; // Get current user's block list
      const existingMatches = userData.matches || [];
      
      // Exit if user profile is incomplete
      if (!userProfile || !userProfile.displayName || !userProfile.age || !userProfile.gender) {
        setError('Please complete your profile before searching for matches.');
        setIsSearching(false);
        return;
      }
      
      // Run the matching algorithm
      const showIds = (userFavorites.shows || []).map((id: string) => id);
      
      if (showIds.length === 0) {
        setError('Add some favorite shows first to find matches!');
        setIsSearching(false);
        return;
      }
      
      // Fetch all show users in parallel
      const showUserQueries = showIds.map((showId: string) => getDoc(doc(db, 'showUsers', showId)));
      const showUserResults = await Promise.all(showUserQueries);
      
      // Process results to find potential matches and their common show counts
      const potentialUserMap = new Map<string, number>(); // Map<userId, commonShowCount>
      for (const showUserDoc of showUserResults) {
        if (showUserDoc.exists()) {
          const data = showUserDoc.data();
          const userIds: string[] = data.users || []; // Simplified array of user IDs
          
          for (const userId of userIds) {
            // Skip current user
            if (userId === user.uid) continue;
            // Skip users already matched
            if (areUsersMatched(existingMatches, userId)) continue;
            // Skip users blocked by the current user
            if (currentUserBlockedList.includes(userId)) continue;
            
            // Count occurrences
            potentialUserMap.set(userId, (potentialUserMap.get(userId) || 0) + 1);
          }
        }
      }
      
      // Filter potential matches based on common show threshold
      const potentialUserIds = Array.from(potentialUserMap.keys())
          .filter(userId => (potentialUserMap.get(userId) || 0) >= MATCH_THRESHOLD);
      
      if (potentialUserIds.length === 0) {
        
        // Don't set error here, let searchMatches handle the final count
        setIsSearching(false);
        return;
      }
      
      // Fetch user details for potential matches IN BATCHES (if many)
      // For simplicity here, fetch all. Consider batching for > 10 users.
      const userDataPromises = potentialUserIds.map(userId => getDoc(doc(db, 'users', userId)));
      const userDataResults = await Promise.all(userDataPromises);
      
      const newMatchesData: MatchData[] = [];
      
      for (let i = 0; i < userDataResults.length; i++) {
        const matchedUserDoc = userDataResults[i];
        const matchedUserId = potentialUserIds[i];
        
        if (matchedUserDoc.exists()) {
          const matchUserData = matchedUserDoc.data();
          const matchUserProfile = matchUserData.profile;
          
          // Skip if profile is incomplete
          if (!matchUserProfile || !matchUserProfile.displayName || !matchUserProfile.gender) continue;
          
          // **Crucial**: Check if the potential match has blocked the current user
          const matchUserBlockedList = matchUserProfile.blockedUsers || [];
          if (matchUserBlockedList.includes(user.uid)) {
             
              continue; // Skip this user
          }
          
          // Check mutual match criteria (gender/location preferences, etc.)
          if (!checkMatchCriteria(userProfile, matchUserProfile)) continue;
          
          // Common shows already calculated via potentialUserMap count
          const commonShowCount = potentialUserMap.get(matchedUserId) || 0;
          
          // Determine match level
          let matchLevel: MatchLevel = commonShowCount >= SUPER_MATCH_THRESHOLD ? 'superMatch' : 'match';
          
          // Get actual common show IDs (needed for profile view)
          const matchUserFavorites = matchUserProfile.favoriteShows || [];
          const commonShowIds = showIds.filter((id: string) => matchUserFavorites.includes(id));
            
            // Create match object for current user
            const matchData: MatchData = {
            userId: matchedUserId,
              displayName: matchUserProfile.displayName,
              age: matchUserProfile.age || '',
              gender: matchUserProfile.gender || '',
              location: matchUserProfile.location || '',
              profilePic: matchUserProfile.profilePic || '',
              commonShowIds: commonShowIds,
            favoriteShowIds: matchUserFavorites, // Store other user's favs
              matchLevel: matchLevel,
              matchTimestamp: Timestamp.now(),
              chattingWith: false
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
            favoriteShowIds: showIds, // Store current user's favs
              matchLevel: matchLevel,
              matchTimestamp: Timestamp.now(),
              chattingWith: false
            };
            
          // Add match to both users in Firestore
          const added = await addMatchToBothUsers(user.uid, matchedUserId, matchData, otherUserMatchData);
          if (added) {
              newMatchesData.push(matchData); // Add to local list only if DB update was likely successful
          }
        }
      }
      
      // Merge new matches with existing ones and update state
      // Important: Use functional update to ensure we have the latest state if findMatches runs quickly
      setMatches(prevExistingMatches => mergeMatches(prevExistingMatches, newMatchesData));
      
      // Error/success message handled by searchMatches based on count
    } catch (error: any) {
      console.error("Error during findMatches:", error);
      setError(`An error occurred while finding matches: ${error.message || error}`);
    } finally {
      // setIsSearching(false); // searchMatches will handle this
    }
  }, [
      user,
      userFavorites.shows, // Depends on favorite shows
      areUsersMatched,
      checkMatchCriteria,
      mergeMatches,
      addMatchToBothUsers,
      // No need for setCooldown here, searchMatches handles it
  ]);
  
  const searchMatches = useCallback(async () => {
    if (!user) return 0;
    
    setIsSearching(true);
    setError(null); // Clear previous errors
    const initialMatchCount = matches.length; // Capture count *before* any updates
    
    try {
      // Set cooldown immediately
      await setCooldown();
      
      // Update showUsers collection for all favorite shows (can happen in parallel with findMatches)
      const favoriteShowIds = userFavorites.shows || [];
      const updateShowUsersPromises = favoriteShowIds.map(showId => updateShowUsers(showId));
      
      // Find matches (this will update the 'matches' state internally)
      await findMatches();
      
      // Wait for showUsers updates to complete (though not strictly necessary for result count)
      await Promise.all(updateShowUsersPromises);
      
      // Calculate new matches using the LATEST state
      // Use a functional state update to get the most recent count
      let finalMatchCount = 0;
      setMatches(currentMatches => {
          finalMatchCount = currentMatches.length;
          return currentMatches; // Return unchanged state, just needed the latest count
      });
      
      const newMatchCount = Math.max(0, finalMatchCount - initialMatchCount); // Ensure non-negative
      
      if (newMatchCount > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
          // Maybe a different feedback if no new matches found? Or just success for completing search.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // Indicate search completion
          setError("No new matches found this time."); // Set a soft error/info message
      }
      
      return newMatchCount; // Return the number of *new* matches found
      
    } catch (error: any) {
        console.error("Error during searchMatches:", error);
        setError(`Search failed: ${error.message || error}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return 0; // Return 0 on error
    } finally {
        setIsSearching(false); // Ensure loading state is turned off
    }
  }, [user, userFavorites.shows, setCooldown, updateShowUsers, findMatches, matches.length]); // matches.length dependency is okay here
  
  // Memoize context value
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
    loadPersistedMatches,
    updateChattingWithStatus,
    blockUser,
    unblockUser,
    blockedUsers
  }), [
    matches, 
    isSearching, 
    cooldownEndTime,
    searchMatches, 
    remainingTimeString, 
    lastSearchTime,
    isLoading,
    findMatches,
    formatTime,
    error,
    unmatchUser,
    loadPersistedMatches,
    updateChattingWithStatus,
    blockUser,
    unblockUser,
    blockedUsers
  ]);
  
  return (
    <MatchContext.Provider value={contextValue}>
      {children}
    </MatchContext.Provider>
  );
}; 