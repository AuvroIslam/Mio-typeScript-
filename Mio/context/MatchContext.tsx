import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { 
  
  doc, 
  getDoc, 

  updateDoc, 
  arrayUnion, 
  arrayRemove,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../config/firebaseConfig';
import { useAuth } from './AuthContext';
import { useFavorites } from './FavoritesContext';
import { useRegistration } from './RegistrationContext';
import * as Haptics from 'expo-haptics';
import { MatchData,  SearchMatchesResponse } from '../types/match';



interface IMatchContext {
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
  updateChattingWithStatus: (userId: string) => Promise<boolean>;
  blockUser: (userIdToBlock: string) => Promise<void>;
  unblockUser: (userIdToUnblock: string) => Promise<void>;
  blockedUsers: string[];
}

interface MatchContextProviderProps {
  children: ReactNode;
}

const MatchContext = createContext<IMatchContext | undefined>(undefined);

export const useMatch = () => {
  const context = useContext(MatchContext);
  if (!context) {
    throw new Error('useMatch must be used within a MatchContextProvider');
  }
  return context;
};

export const MatchContextProvider: React.FC<MatchContextProviderProps> = ({ children }) => {
  const { user } = useAuth();
  
  const { userFavorites } = useFavorites();
  
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [cooldownEndTime, setCooldownEndTime] = useState<Date | null>(null);
  const [remainingTimeString, setRemainingTimeString] = useState<string>('');
  const [lastSearchTime, setLastSearchTime] = useState<Date | null>(null);
  const [searchCount, setSearchCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  
  // Initialize Firebase Functions
  const functions = getFunctions();
  const callDeleteConversationData = httpsCallable(functions, 'deleteConversationData');
  const callSearchUserMatches = httpsCallable(functions, 'searchUserMatches');
  
  // Replace loadPersistedMatches and part of loadUserSearchData with a real-time listener
  useEffect(() => {
    if (user) {
   
      setIsLoading(true);
      const userRef = doc(db, 'users', user.uid);

      // Setup the real-time listener
      const unsubscribe = onSnapshot(userRef, 
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            const profile = data.profile || {};
            
            // Update matches state from the snapshot

            setMatches(data.matches || []); 
            
            // Update blocked users state from the snapshot
            setBlockedUsers(profile.blockedUsers || []);

            // Update search data (can be combined here)
            if (data.matchSearchCount !== undefined) {
              setSearchCount(data.matchSearchCount);
            } else {
              setSearchCount(0);
            }
            if (data.lastMatchSearch) {
              const lastSearch = data.lastMatchSearch.toDate();
              setLastSearchTime(lastSearch);
              if (data.cooldownEndTime) {
                const cooldownEnd = data.cooldownEndTime.toDate();
                const now = new Date();
                if (cooldownEnd > now) {
                  setCooldownEndTime(cooldownEnd);
                } else {
                  setCooldownEndTime(null); // Clear ended cooldown
                  // Optional: reset search count logic if needed based on time
                  // const hoursSinceLastSearch = (now.getTime() - lastSearch.getTime()) / (1000 * 60 * 60);
                  // if (hoursSinceLastSearch > 24 && data.matchSearchCount > 0) { ... }
                }
              } else {
                 setCooldownEndTime(null); // Clear if missing
              }
            } else {
              setLastSearchTime(null);
              setCooldownEndTime(null); 
            }
            setError(null); // Clear error on successful update
          } else {
            // User document doesn't exist (maybe deleted?)

            setMatches([]);
            setBlockedUsers([]);
            setCooldownEndTime(null);
            setLastSearchTime(null);
            setSearchCount(0);
            setError("User data not found.");
          }
          setIsLoading(false); // Set loading false after first snapshot received
        },
        (err) => {
          console.error("[MatchContext] Error listening to user document:", err);
          setError("Failed to load user data in real-time.");
          setIsLoading(false);
          // Reset state on error
          setMatches([]);
          setBlockedUsers([]);
          setCooldownEndTime(null);
          setLastSearchTime(null);
          setSearchCount(0);
        }
      );

      // Cleanup function: Detach the listener when user logs out or component unmounts
      return () => {
  
        unsubscribe();
      };

    } else {
      // User logged out, reset everything

      setMatches([]);
      setBlockedUsers([]);
      setCooldownEndTime(null);
      setLastSearchTime(null);
      setSearchCount(0);
      setIsLoading(false);
      setError(null);
    }
  }, [user]); // Re-run effect when user changes
  
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
      setMatches(prev => {
    
        return prev.map(match => 
        match.userId === matchedUserId 
          ? { ...match, chattingWith: true } 
          : match
        );
      });
      
      return true;
    } catch (error) {
      console.error('[MatchContext] Error updating chattingWith status:', error);
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
        setMatches(prev => {
          const newMatches = prev.filter(match => match.userId !== matchedUserId);
  
          return newMatches;
        });

        // 3. Call Cloud Function to delete conversation data (regardless of block action)
        try {
 
          const result = await callDeleteConversationData({ otherUserId: matchedUserId });

        } catch (cfError: any) {
            console.error('[MatchContext] Error calling deleteConversationData Cloud Function:', cfError);
            setError(`Unmatch successful, but failed to cleanup conversation data fully: ${cfError.message || cfError}`);
        }

        // 4. Haptic feedback (only if not part of a block action, blockUser will handle its own)
        if (!isBlockAction) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

    } catch (error: any) {
        console.error('[MatchContext] Error in unmatchUser process:', error);
        setError(`Failed to unmatch user: ${error.message || error}`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // loadPersistedMatches(); // Reload matches on error - REMOVED, listener handles updates
        throw error; // Re-throw if needed by caller
    }
  }, [user, callDeleteConversationData, matches.length]); // REMOVED loadPersistedMatches dependency
  
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
        console.error(`[MatchContext] Error blocking user ${userIdToBlock}:`, error);
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
          console.error(`[MatchContext] Error unblocking user ${userIdToUnblock}:`, error);
          setError(`Failed to unblock user: ${error.message || error}`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          // Attempt to rollback local state if Firestore update failed but local state changed
          setBlockedUsers(prev => [...prev, userIdToUnblock]); // Add back if it was removed locally
      }
  }, [user, blockedUsers]);
  
  // Modified searchMatches function that uses the cloud function instead of client logic
  const searchMatches = useCallback(async () => {
    if (!user) return 0;
    
    setIsSearching(true);
    setError(null);
    
    try {
      // Use the cloud function to search for matches
      const result = await callSearchUserMatches({
        favoriteShowIds: userFavorites.shows || []
      });
      
      // Process the response
      const data = result.data as SearchMatchesResponse;
      
      if (data.success) {
        // Update cooldown time regardless of finding new matches
        if (data.cooldownEnd) {
          const cooldownEndDate = new Date(data.cooldownEnd);
          setCooldownEndTime(cooldownEndDate); // Always set cooldown from response
          setLastSearchTime(new Date());
          // Update search count locally based on previous count (server updates canonical count)
          const newSearchCount = (searchCount % 3) + 1;
          setSearchCount(newSearchCount); 
        } else {
          // If server didn't return a cooldown, clear it locally (shouldn't happen on success normally)
          setCooldownEndTime(null);
        }
        
        // Handle feedback
        const newMatchCount = data.matchCount || 0;
      
      if (newMatchCount > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
            // Provide feedback even if no new matches found, but search was successful
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); // Use Warning or Success
            // Optionally set a temporary message via setError or a dedicated state
            // setError("No new matches found this time."); // Example
          }
        
        return newMatchCount; // Return count as before
      } else {
        throw new Error(data.message || "Unknown error in search matches");
      }
    } catch (error: any) {
        setError(`Search failed: ${error.message || error}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return 0;
    } finally {
      setIsSearching(false);
    }
  }, [user, userFavorites.shows, callSearchUserMatches, cooldownEndTime, searchCount]); // Added cooldownEndTime, searchCount to dependencies

  // Implement findMatches as a wrapper around searchMatches for compatibility
  const findMatches = useCallback(async () => {
    try {

      await searchMatches();
    } catch (error) {
      console.error("[MatchContext] Error in findMatches:", error);
      setError("Failed to find matches");
    }
  }, [searchMatches]);
  
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