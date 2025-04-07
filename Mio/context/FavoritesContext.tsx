import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, Timestamp, setDoc } from 'firebase/firestore';
import { AppState, AppStateStatus } from 'react-native';
import { db } from '../config/firebaseConfig';
import { useAuth } from './AuthContext';
import * as Haptics from 'expo-haptics';

// Constants
const MAX_FAVORITES = 10;
const MAX_WEEKLY_REMOVALS = 5;
const COOLDOWN_MINUTES = 5;

type FavoriteType = 'anime' | 'kdrama';

interface ShowItem {
  id: number;
  title: string;
  posterPath: string;
  overview: string;
  type: FavoriteType;
}

interface UserFavorites {
  shows: string[];
}

interface FavoritesContextType {
  // State
  userFavorites: UserFavorites;
  isAddingToFavorites: boolean;
  isRemovingFavorite: boolean;
  cooldownTimer: number | null;
  removalCount: number;
  
  // Methods
  isFavorite: (show: ShowItem) => boolean;
  addToFavorites: (show: ShowItem, onSuccess?: () => void, onError?: () => void) => Promise<void>;
  removeFromFavorites: (show: ShowItem, onSuccess?: () => void, onError?: () => void) => Promise<void>;
  confirmAddToFavorites: (show: ShowItem, onSuccess?: () => void, onError?: () => void, onLimit?: () => void) => void;
  confirmRemoveFromFavorites: (show: ShowItem, onSuccess?: () => void, onError?: () => void, onCooldown?: (remainingTime: number) => void) => void;
  refreshUserFavorites: () => Promise<void>;
  getRemainingRemovals: () => number;
  getTotalFavorites: () => number;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [userFavorites, setUserFavorites] = useState<UserFavorites>({
    shows: []
  });
  const [isAddingToFavorites, setIsAddingToFavorites] = useState(false);
  const [isRemovingFavorite, setIsRemovingFavorite] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState<number | null>(null);
  const [removalCount, setRemovalCount] = useState(0);
  const [lastRemovalTime, setLastRemovalTime] = useState<Date | null>(null);
  const [cooldownEndTime, setCooldownEndTime] = useState<Date | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  // Initial fetch and cooldown timer setup
  useEffect(() => {
    if (user) {
      refreshUserFavorites();
    } else {
      resetState();
    }
  }, [user]);

  // App state change listener for handling background/foreground transitions
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      // When app comes to foreground from background/inactive state
      if (appState !== 'active' && nextAppState === 'active' && cooldownEndTime) {
        // Recalculate remaining time based on absolute end time
        updateRemainingCooldownTime();
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState, cooldownEndTime]);

  // Function to update timer based on absolute end time
  const updateRemainingCooldownTime = useCallback(() => {
    if (!cooldownEndTime) return;
    
    const now = new Date();
    const remainingMs = cooldownEndTime.getTime() - now.getTime();
    
    if (remainingMs <= 0) {
      setCooldownEndTime(null);
      setCooldownTimer(null);
      setRemovalCount(0);
    } else {
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      setCooldownTimer(remainingSeconds);
    }
  }, [cooldownEndTime]);

  // Countdown timer effect - now uses the updateRemainingCooldownTime function
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (cooldownEndTime) {
      // Initial call to set the correct time
      updateRemainingCooldownTime();
      
      // Set up interval that updates while app is in foreground
      interval = setInterval(() => {
        updateRemainingCooldownTime();
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [cooldownEndTime, updateRemainingCooldownTime]);

  const resetState = () => {
    setUserFavorites({ shows: [] });
    setRemovalCount(0);
    setCooldownTimer(null);
    setLastRemovalTime(null);
    setCooldownEndTime(null);
  };

  const refreshUserFavorites = async () => {
    if (!user) return;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists() && userDoc.data().profile) {
        const profile = userDoc.data().profile;
        
        // Update favorites - if favoriteShows exists use it, otherwise try to merge the old format
        const updatedFavorites = {
          shows: profile.favoriteShows || []
        };
        
        setUserFavorites(updatedFavorites);
        
        // Update removal count and check cooldown
        if (profile.weeklyRemovals !== undefined) {
          setRemovalCount(profile.weeklyRemovals);
        }
        
        if (profile.lastRemovalTime) {
          const lastRemoval = profile.lastRemovalTime.toDate();
          const cooldownEnd = new Date(lastRemoval.getTime() + COOLDOWN_MINUTES * 60 * 1000);
          const now = new Date();
          
          if (now < cooldownEnd) {
            // Cooldown is still active
            const remainingMs = cooldownEnd.getTime() - now.getTime();
            setCooldownTimer(Math.ceil(remainingMs / 1000));
            setLastRemovalTime(lastRemoval);
            setCooldownEndTime(cooldownEnd);
          } else if (profile.weeklyRemovals === 0) {
            // Cooldown has expired and reset is already done
            setCooldownTimer(null);
            setLastRemovalTime(null);
            setCooldownEndTime(null);
          } else {
            // Cooldown has expired but count wasn't reset
            setCooldownTimer(null);
            setRemovalCount(0);
            setLastRemovalTime(null);
            setCooldownEndTime(null);
            
            // Update Firestore
            try {
              await updateDoc(doc(db, 'users', user.uid), {
                'profile.weeklyRemovals': 0
              });
            } catch (error) {
              // Silent error handling
            }
          }
        }
      }
    } catch (error) {
      // Silent error handling
    }
  };

  const isFavorite = useCallback((show: ShowItem): boolean => {
    return userFavorites.shows.includes(show.id.toString());
  }, [userFavorites.shows]);

  const getTotalFavorites = useCallback((): number => {
    return userFavorites.shows.length;
  }, [userFavorites.shows]);

  const getRemainingRemovals = useCallback((): number => {
    return MAX_WEEKLY_REMOVALS - removalCount;
  }, [removalCount]);

  // Helper function to update the showUsers collection
  const updateShowUsers = async (showId: string, isAdding: boolean) => {
    if (!user) return;
    
    try {
      const showUserRef = doc(db, 'showUsers', showId);
      
      if (isAdding) {
        // Add user ID using arrayUnion. If the doc doesn't exist, it creates it.
        // If the user ID is already in the array, it does nothing.
        await setDoc(showUserRef, {
          showId: showId, // Optional: keep showId for clarity
          users: arrayUnion(user.uid)
        }, { merge: true }); // Use merge: true to create or update
      } else {
        // Remove user ID using arrayRemove. If the user ID isn't there, it does nothing.
        // If the document exists and the array becomes empty, the document remains.
        await updateDoc(showUserRef, {
          users: arrayRemove(user.uid)
        });
      }
    } catch (error) {
      // Silent error handling
    }
  };

  const addToFavorites = async (show: ShowItem, onSuccess?: () => void, onError?: () => void): Promise<void> => {
    if (!user) return;
    
    const showId = show.id.toString();
    
    setIsAddingToFavorites(true);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      
      // First update local state immediately for better UI responsiveness
      const updatedFavorites = {
        ...userFavorites,
        shows: [...userFavorites.shows, showId]
      };
      setUserFavorites(updatedFavorites);
      
      // Then update Firestore
      await updateDoc(userRef, {
        'profile.favoriteShows': arrayUnion(showId)
      });
      
      // Update showUsers collection
      await updateShowUsers(showId, true);
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Call success callback after both local and remote updates are complete
      if (onSuccess) setTimeout(() => onSuccess(), 0);
    } catch (error) {
      // Rollback local state on error
      const rollbackFavorites = {
        ...userFavorites,
        shows: userFavorites.shows.filter(id => id !== showId)
      };
      setUserFavorites(rollbackFavorites);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (onError) setTimeout(() => onError(), 0);
    } finally {
      setIsAddingToFavorites(false);
    }
  };

  const removeFromFavorites = async (show: ShowItem, onSuccess?: () => void, onError?: () => void): Promise<void> => {
    if (!user) return;
    
    const showId = show.id.toString();
    
    setIsRemovingFavorite(true);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      
      // Calculate the new removal count
      const newRemovalCount = removalCount + 1;
      
      // Check if this is the 5th removal (max limit) to start cooldown
      const needsCooldown = newRemovalCount >= MAX_WEEKLY_REMOVALS;
      const now = new Date();
      
      // First update local state immediately for better UI responsiveness
      const updatedFavorites = {
        ...userFavorites,
        shows: userFavorites.shows.filter(id => id !== showId)
      };
      setUserFavorites(updatedFavorites);
      
      // Update removal count and cooldown in local state
      if (needsCooldown) {
        setRemovalCount(0);
        const cooldownEnd = new Date(now.getTime() + COOLDOWN_MINUTES * 60 * 1000);
        setCooldownEndTime(cooldownEnd);
        setCooldownTimer(COOLDOWN_MINUTES * 60);
        setLastRemovalTime(now);
      } else {
        setRemovalCount(newRemovalCount);
      }
      
      // Then update Firestore
      await updateDoc(userRef, {
        'profile.favoriteShows': arrayRemove(showId),
        'profile.lastRemovalTime': needsCooldown ? Timestamp.now() : (lastRemovalTime ? Timestamp.fromDate(lastRemovalTime) : null),
        'profile.weeklyRemovals': needsCooldown ? 0 : newRemovalCount,
        'profile.cooldownEndTime': needsCooldown ? Timestamp.fromDate(new Date(now.getTime() + COOLDOWN_MINUTES * 60 * 1000)) : null
      });
      
      // Update showUsers collection
      await updateShowUsers(showId, false);
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Call success callback after both local and remote updates are complete
      if (onSuccess) setTimeout(() => onSuccess(), 0);
    } catch (error) {
      console.error("Error removing from favorites:", error);
      // Rollback local state on error
      refreshUserFavorites(); // Reload from Firestore to ensure consistency
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (onError) setTimeout(() => onError(), 0);
    } finally {
      setIsRemovingFavorite(false);
    }
  };

  const confirmAddToFavorites = (
    show: ShowItem, 
    onSuccess?: () => void, 
    onError?: () => void,
    onLimit?: () => void
  ) => {
    if (!user) {
      if (onError) onError();
      return;
    }
    
    // If it's already a favorite, just remove it without confirmation
    if (isFavorite(show)) {
      confirmRemoveFromFavorites(show, onSuccess, onError);
      return;
    }
    
    // Check if we're at the favorites limit
    const totalFavorites = getTotalFavorites();
    if (totalFavorites >= MAX_FAVORITES) {
      if (onLimit) onLimit();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    
    // Add to favorites directly
    addToFavorites(show, onSuccess, onError);
  };

  const confirmRemoveFromFavorites = (
    show: ShowItem, 
    onSuccess?: () => void, 
    onError?: () => void,
    onCooldown?: (remainingTime: number) => void
  ) => {
    if (!user) {
      if (onError) onError();
      return;
    }
    
    // If it's not a favorite, do nothing
    if (!isFavorite(show)) {
      return;
    }
    
    // Check if on cooldown
    if (cooldownTimer && cooldownTimer > 0) {
      if (onCooldown) onCooldown(cooldownTimer);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    
    // Remove from favorites
    removeFromFavorites(show, onSuccess, onError);
  };

  return (
    <FavoritesContext.Provider
      value={{
        userFavorites,
        isAddingToFavorites,
        isRemovingFavorite,
        cooldownTimer,
        removalCount,
        isFavorite,
        addToFavorites,
        removeFromFavorites,
        confirmAddToFavorites,
        confirmRemoveFromFavorites,
        refreshUserFavorites,
        getRemainingRemovals,
        getTotalFavorites
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = (): FavoritesContextType => {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}; 