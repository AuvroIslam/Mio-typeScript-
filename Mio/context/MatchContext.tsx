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
 
  Timestamp,
 
  deleteDoc
} from 'firebase/firestore';
import { AppState, AppStateStatus } from 'react-native';
import { db } from '../config/firebaseConfig';
import { useAuth } from './AuthContext';
import { useFavorites } from './FavoritesContext';

import * as Haptics from 'expo-haptics';
import { logoutEventEmitter, LOGOUT_EVENT } from './AuthContext';

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
}

interface MatchContextType {
  matches: MatchData[];
  chattingWith: MatchData[];
  blockedUsers: MatchData[];
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
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>; 
  moveToChattingWith: (userId: string) => Promise<void>;
  loadPersistedMatches: () => Promise<void>;
  isNewMatch: (matchTimestamp: any) => boolean;
}

interface MatchContextProviderProps {
  children: ReactNode;
}

const MatchContext = createContext<MatchContextType | undefined>(undefined);

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
  const [chattingWith, setChattingWith] = useState<MatchData[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<MatchData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [cooldownEndTime, setCooldownEndTime] = useState<Date | null>(null);
  const [remainingTimeString, setRemainingTimeString] = useState<string>('');
  const [lastSearchTime, setLastSearchTime] = useState<Date | null>(null);
  const [searchCount, setSearchCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  
  // Load matches when the user changes
  useEffect(() => {
    if (user) {
      loadPersistedMatches();
      loadUserSearchData();
    } else {
      setMatches([]);
      setChattingWith([]);
      setBlockedUsers([]);
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
      if (userDoc.exists()) {
        // Load matches
        const userMatches = userDoc.data().matches || [];
        setMatches(userMatches);
        
        // Load chatting with
        const userChattingWith = userDoc.data().chattingWith || [];
        setChattingWith(userChattingWith);
        
        // Load blocked users
        const userBlockedUsers = userDoc.data().blockedUsers || [];
        setBlockedUsers(userBlockedUsers);
      } else {
        setMatches([]);
        setChattingWith([]);
        setBlockedUsers([]);
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
      const showUserDoc = await getDoc(showUserRef);
      
      if (showUserDoc.exists()) {
        const data = showUserDoc.data();
        const users = data.users || [];
        
        // Check if user is already in the list
        const userExists = users.some((u: any) => u.userId === user.uid);
        
        if (!userExists) {
          // User doesn't exist, add to list (without timestamp)
          await updateDoc(showUserRef, {
            users: arrayUnion({ userId: user.uid })
          });
        }
        // If user exists, do nothing - no need to update timestamp
      } else {
        // Document doesn't exist, create it (without timestamp)
        await setDoc(showUserRef, {
          showId,
          users: [{ userId: user.uid }]
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
  
  const isUserBlocked = useCallback((blockedUsersList: MatchData[], userId: string): boolean => {
    return blockedUsersList.some(user => user.userId === userId);
  }, []);
  
  const isUserChattingWith = useCallback((chattingWithList: MatchData[], userId: string): boolean => {
    return chattingWithList.some(user => user.userId === userId);
  }, []);
  
  const moveToChattingWith = useCallback(async (matchedUserId: string) => {
    if (!user) return;
    
    try {
      // Get current user's data
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) return;
      
      const userData = userDoc.data();
      const userMatches = userData.matches || [];
      const userChattingWith = userData.chattingWith || [];
      
      // Find the match to move
      const matchToMove = userMatches.find((match: MatchData) => match.userId === matchedUserId);
      
      if (!matchToMove) return; // Match not found
      
      // Check if already in chattingWith
      const alreadyChatting = userChattingWith.some((chat: MatchData) => chat.userId === matchedUserId);
      
      if (alreadyChatting) return; // Already chatting with this user
      
      // Update current user - remove from matches, add to chattingWith
        const updatedMatches = userMatches.filter((match: MatchData) => match.userId !== matchedUserId);
        
        await updateDoc(userRef, {
        matches: updatedMatches,
        chattingWith: arrayUnion(matchToMove)
        });
      
      // Do the same for the other user
      const matchedUserRef = doc(db, 'users', matchedUserId);
      const matchedUserDoc = await getDoc(matchedUserRef);
      
      if (matchedUserDoc.exists()) {
        const matchedUserData = matchedUserDoc.data();
        const matchedUserMatches = matchedUserData.matches || [];
        const matchedUserChattingWith = matchedUserData.chattingWith || [];
        
        // Find the current user in the matched user's matches
        const currentUserMatch = matchedUserMatches.find((match: MatchData) => match.userId === user.uid);
        
        if (currentUserMatch && !matchedUserChattingWith.some((chat: MatchData) => chat.userId === user.uid)) {
          // Update matched user
        const updatedMatchedUserMatches = matchedUserMatches.filter((match: MatchData) => match.userId !== user.uid);
        
        await updateDoc(matchedUserRef, {
            matches: updatedMatchedUserMatches,
            chattingWith: arrayUnion(currentUserMatch)
        });
        }
      }
      
      // Update local state
      setMatches(updatedMatches);
      setChattingWith(prev => [...prev, matchToMove]);
      
    } catch (error) {
      console.error("Error moving to chatting with:", error);
    }
  }, [user]);
  
  const unmatchUser = useCallback(async (matchedUserId: string) => {
    if (!user) return;
    
    try {
      // Get current user's data
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const userMatches = userData.matches || [];
        const userChattingWith = userData.chattingWith || [];
        
        // Remove from matches if present
        let updatedMatches = userMatches;
        const inMatches = userMatches.some((match: MatchData) => match.userId === matchedUserId);
        
        if (inMatches) {
          updatedMatches = userMatches.filter((match: MatchData) => match.userId !== matchedUserId);
        }
        
        // Remove from chattingWith if present
        let updatedChattingWith = userChattingWith;
        const inChattingWith = userChattingWith.some((chat: MatchData) => chat.userId === matchedUserId);
        
        if (inChattingWith) {
          updatedChattingWith = userChattingWith.filter((chat: MatchData) => chat.userId !== matchedUserId);
        }
        
        // Update current user
        await updateDoc(userRef, {
          matches: updatedMatches,
          chattingWith: updatedChattingWith
        });
        
        // Update matched user
        const matchedUserRef = doc(db, 'users', matchedUserId);
        const matchedUserDoc = await getDoc(matchedUserRef);
        
        if (matchedUserDoc.exists()) {
          const matchedUserData = matchedUserDoc.data();
          const matchedUserMatches = matchedUserData.matches || [];
          const matchedUserChattingWith = matchedUserData.chattingWith || [];
          
          // Remove current user from matched user's data
          const updatedMatchedUserMatches = matchedUserMatches.filter((match: MatchData) => match.userId !== user.uid);
          const updatedMatchedUserChattingWith = matchedUserChattingWith.filter((chat: MatchData) => chat.userId !== user.uid);
          
          await updateDoc(matchedUserRef, {
            matches: updatedMatchedUserMatches,
            chattingWith: updatedMatchedUserChattingWith
          });
        }
        
        // Delete conversation if it exists
        await deleteConversationBetweenUsers(user.uid, matchedUserId);
        
        // Update local state
        setMatches(updatedMatches);
        setChattingWith(updatedChattingWith);
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error unmatching user:', error);
      setError('Failed to unmatch user');
      
      // Trigger haptic feedback for error
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [user]);
  
  const blockUser = useCallback(async (userIdToBlock: string) => {
    if (!user) return;
    
    try {
      // First unmatch the user (which also deletes conversations)
      await unmatchUser(userIdToBlock);
      
      // Get user data for the blocked user to store in blockedUsers array
      const blockedUserRef = doc(db, 'users', userIdToBlock);
      const blockedUserDoc = await getDoc(blockedUserRef);
      
      if (blockedUserDoc.exists()) {
        const blockedUserData = blockedUserDoc.data();
        const blockedUserProfile = blockedUserData.profile || {};
        
        // Create a simplified version of user data for the blocked list
        const blockedUserInfo: MatchData = {
          userId: userIdToBlock,
          displayName: blockedUserProfile.displayName || 'User',
          profilePic: blockedUserProfile.profilePic || '',
          matchLevel: 'match' as MatchLevel, // Type cast to MatchLevel
          commonShowIds: [],
          favoriteShowIds: [],
          matchTimestamp: Timestamp.now()
        };
        
        // Update current user's blocked list
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          blockedUsers: arrayUnion(blockedUserInfo)
        });
        
        // Update local state
        setBlockedUsers(prev => [...prev, blockedUserInfo]);
        
        // Trigger haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error blocking user:', error);
      setError('Failed to block user');
      
      // Trigger haptic feedback for error
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [user, unmatchUser]);
  
  const unblockUser = useCallback(async (userIdToUnblock: string) => {
    if (!user) return;
    
    try {
      // Get current user's blocked list
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const userBlockedUsers = userData.blockedUsers || [];
        
        // Filter out the user to unblock
        const updatedBlockedUsers = userBlockedUsers.filter((blockedUser: MatchData) => blockedUser.userId !== userIdToUnblock);
        
        // Update Firestore
        await updateDoc(userRef, {
          blockedUsers: updatedBlockedUsers
        });
        
        // Update local state
        setBlockedUsers(updatedBlockedUsers);
        
        // Trigger haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error unblocking user:', error);
      setError('Failed to unblock user');
      
      // Trigger haptic feedback for error
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [user]);
  
  // Helper function to delete conversation between two users
  const deleteConversationBetweenUsers = useCallback(async (userA: string, userB: string) => {
    try {
      // Find conversation between these users
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participants', 'array-contains', userA)
      );
      
      const querySnapshot = await getDocs(q);
      let conversationId: string | null = null;
      
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        if (data.participants && data.participants.includes(userB)) {
          conversationId = docSnapshot.id;
        }
      });
      
      if (conversationId) {
        // Delete message batches subcollection first
        const batchesRef = collection(db, `conversations/${conversationId}/messageBatches`);
        const batchesSnapshot = await getDocs(batchesRef);
        
        const batchPromises: Promise<void>[] = [];
        batchesSnapshot.forEach((batchDoc) => {
          batchPromises.push(deleteDoc(doc(db, `conversations/${conversationId}/messageBatches`, batchDoc.id)));
        });
        
        await Promise.all(batchPromises);
        
        // Then delete the conversation document
        await deleteDoc(doc(db, 'conversations', conversationId));
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  }, []);
  
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
      
      // Get user blocked list and chatting with list
      const userBlockedList = userData.blockedUsers || [];
      const userChattingWith = userData.chattingWith || [];
      
      // Get existing matches to avoid duplicates
      const existingMatches = userData.matches || [];
      
      // Run the matching algorithm
      const showIds = (userFavorites.shows || []).map((id: string) => id);
      
      if (showIds.length === 0) {
        setError('Add some favorite shows first to find matches!');
        setIsSearching(false);
        return;
      }
      
 
      
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
            
            // Skip users already matched or in chattingWith
            if (areUsersMatched(existingMatches, userEntry.userId) || 
                isUserChattingWith(userChattingWith, userEntry.userId)) continue;
            
            // Skip users in blocked list
            if (isUserBlocked(userBlockedList, userEntry.userId)) continue;
            
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
          const matchUserBlockedList = matchUserData.blockedUsers || [];
          
          // Skip if profile is incomplete
          if (!matchUserProfile || !matchUserProfile.displayName || !matchUserProfile.gender) continue;
          
          // Skip if current user is in this user's block list
          if (isUserBlocked(matchUserBlockedList, user.uid)) continue;
          
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
              favoriteShowIds: matchUserFavorites,
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
              favoriteShowIds: showIds,
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
  }, [user, userFavorites, areUsersMatched, isUserChattingWith, isUserBlocked, setCooldown, checkMatchCriteria, mergeMatches, addMatchToBothUsers]);
  
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
  
  // Utility function to check if a match is less than 24 hours old
  const isNewMatch = useCallback((matchTimestamp: any): boolean => {
    if (!matchTimestamp) return false;
    
    try {
      // Convert Firestore timestamp to Date if necessary
      const matchDate = matchTimestamp.toDate ? 
        matchTimestamp.toDate() : 
        new Date(matchTimestamp);
      
      const now = new Date();
      const timeDiff = now.getTime() - matchDate.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      
      return hoursDiff < 24;
    } catch (error) {
      console.error('Error calculating match age:', error);
      return false;
    }
  }, []);
  
  // Inside the MatchContextProvider, add this useEffect
  useEffect(() => {
    // Handle logout event
    const handleLogout = () => {
      // Reset all state
      setMatches([]);
      setChattingWith([]);
      setBlockedUsers([]);
      setCooldownEndTime(null);
      setRemainingTimeString('');
      setLastSearchTime(null);
      setSearchCount(0);
      setIsLoading(false);
      setError(null);
    };

    // Listen for logout events
    logoutEventEmitter.addListener(LOGOUT_EVENT, handleLogout);

    // Clean up
    return () => {
      logoutEventEmitter.removeListener(LOGOUT_EVENT, handleLogout);
    };
  }, []);
  
  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    matches,
    chattingWith,
    blockedUsers,
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
    blockUser,
    unblockUser,
    moveToChattingWith,
    loadPersistedMatches,
    isNewMatch
  }), [
    matches, 
    chattingWith,
    blockedUsers,
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
    blockUser,
    unblockUser,
    moveToChattingWith,
    loadPersistedMatches,
    isNewMatch
  ]);
  
  return (
    <MatchContext.Provider value={contextValue}>
      {children}
    </MatchContext.Provider>
  );
}; 