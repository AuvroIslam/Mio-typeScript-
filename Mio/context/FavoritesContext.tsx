import React, { createContext, useState, useContext, useEffect } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, Timestamp, increment, setDoc } from 'firebase/firestore';
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

  // Initial fetch and cooldown timer setup
  useEffect(() => {
    if (user) {
      console.log(`FavoritesContext: User authenticated (${user.uid}), fetching favorites`);
      refreshUserFavorites();
    } else {
      console.log('FavoritesContext: No user authenticated, resetting state');
      resetState();
    }
  }, [user]);

  // Countdown timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (cooldownTimer && cooldownTimer > 0) {
      interval = setInterval(() => {
        setCooldownTimer(prev => {
          if (prev && prev > 1) {
            return prev - 1;
          } else {
            // Reset removal count when cooldown expires
            setRemovalCount(0);
            return null;
          }
        });
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [cooldownTimer]);

  const resetState = () => {
    setUserFavorites({ shows: [] });
    setRemovalCount(0);
    setCooldownTimer(null);
    setLastRemovalTime(null);
  };

  const refreshUserFavorites = async () => {
    if (!user) return;
    
    console.log(`FavoritesContext: Refreshing favorites for user ${user.uid}`);
    
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists() && userDoc.data().profile) {
        const profile = userDoc.data().profile;
        
        // Update favorites - if favoriteShows exists use it, otherwise try to merge the old format
        const updatedFavorites = {
          shows: profile.favoriteShows || []
        };
        
        console.log(`FavoritesContext: Loaded favorites - Shows: ${updatedFavorites.shows.length}`);
        
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
          } else if (profile.weeklyRemovals === 0) {
            // Cooldown has expired and reset is already done
            setCooldownTimer(null);
            setLastRemovalTime(null);
          } else {
            // Cooldown has expired but count wasn't reset
            setCooldownTimer(null);
            setRemovalCount(0);
            setLastRemovalTime(null);
            
            // Update Firestore
            try {
              await updateDoc(doc(db, 'users', user.uid), {
                'profile.weeklyRemovals': 0
              });
            } catch (error) {
              console.error('Error updating profile after cooldown:', error);
            }
          }
        }
      } else {
        console.log('FavoritesContext: User document exists but no profile data found');
      }
    } catch (error) {
      console.error('FavoritesContext: Error fetching user favorites:', error);
    }
  };

  const isFavorite = React.useCallback((show: ShowItem): boolean => {
    return userFavorites.shows.includes(show.id.toString());
  }, [userFavorites.shows]);

  const getTotalFavorites = React.useCallback((): number => {
    return userFavorites.shows.length;
  }, [userFavorites.shows]);

  const getRemainingRemovals = React.useCallback((): number => {
    return MAX_WEEKLY_REMOVALS - removalCount;
  }, [removalCount]);

  // Helper function to update the showUsers collection
  const updateShowUsers = async (showId: string, isAdding: boolean) => {
    if (!user) return;
    
    try {
      const showUserRef = doc(db, 'showUsers', showId);
      const showUserDoc = await getDoc(showUserRef);
      
      const now = Timestamp.now();
      const entry = {
        userId: user.uid,
        timestamp: now
      };
      
      if (showUserDoc.exists()) {
        if (isAdding) {
          // Adding user to the show's users list
          const users = showUserDoc.data().users || [];
          const userIndex = users.findIndex((u: any) => u.userId === user.uid);
          
          if (userIndex >= 0) {
            // User already exists, update timestamp
            users[userIndex].timestamp = now;
            await updateDoc(showUserRef, { users });
          } else {
            // Add user to array
            await updateDoc(showUserRef, {
              users: arrayUnion(entry)
            });
          }
        } else {
          // Removing user from the show's users list
          const users = showUserDoc.data().users || [];
          const filteredUsers = users.filter((u: any) => u.userId !== user.uid);
          await updateDoc(showUserRef, { users: filteredUsers });
        }
      } else if (isAdding) {
        // Create document if adding
        await setDoc(showUserRef, {
          showId,
          users: [entry]
        });
      }
    } catch (error) {
      console.error(`Error updating showUsers for ${showId}:`, error);
    }
  };

  const addToFavorites = async (show: ShowItem, onSuccess?: () => void, onError?: () => void): Promise<void> => {
    if (!user) return;
    
    const showId = show.id.toString();
    
    console.log(`FavoritesContext: Adding ${show.title} (ID: ${show.id}) to favorites`);
    setIsAddingToFavorites(true);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      
      // First update local state immediately for better UI responsiveness
      const updatedFavorites = {
        ...userFavorites,
        shows: [...userFavorites.shows, showId]
      };
      setUserFavorites(updatedFavorites);
      console.log(`FavoritesContext: Updated local state immediately, now ${updatedFavorites.shows.length} favorites`);
      
      // Then update Firestore
      await updateDoc(userRef, {
        'profile.favoriteShows': arrayUnion(showId)
      });
      
      // Update showUsers collection
      await updateShowUsers(showId, true);
      
      console.log(`FavoritesContext: Successfully added to Firestore`);
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Call success callback after both local and remote updates are complete
      if (onSuccess) setTimeout(() => onSuccess(), 0);
    } catch (error) {
      console.error('FavoritesContext: Error adding to favorites:', error);
      
      // Rollback local state on error
      const rollbackFavorites = {
        ...userFavorites,
        shows: userFavorites.shows.filter(id => id !== showId)
      };
      setUserFavorites(rollbackFavorites);
      console.log(`FavoritesContext: Rolled back local state due to error`);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (onError) setTimeout(() => onError(), 0);
    } finally {
      setIsAddingToFavorites(false);
    }
  };

  const removeFromFavorites = async (show: ShowItem, onSuccess?: () => void, onError?: () => void): Promise<void> => {
    if (!user) return;
    
    const showId = show.id.toString();
    
    console.log(`FavoritesContext: Removing ${show.title} (ID: ${show.id}) from favorites`);
    setIsRemovingFavorite(true);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      
      // Calculate the new removal count
      const newRemovalCount = removalCount + 1;
      
      // Check if this is the 5th removal (max limit) to start cooldown
      const needsCooldown = newRemovalCount >= MAX_WEEKLY_REMOVALS;
      const now = new Date();
      
      console.log(`FavoritesContext: Current removal count: ${removalCount}, new count: ${newRemovalCount}, needs cooldown: ${needsCooldown}`);
      
      // First update local state immediately for better UI responsiveness
      const updatedFavorites = {
        ...userFavorites,
        shows: userFavorites.shows.filter(id => id !== showId)
      };
      setUserFavorites(updatedFavorites);
      
      // Update removal count and cooldown in local state
      if (needsCooldown) {
        console.log(`FavoritesContext: Setting cooldown timer for ${COOLDOWN_MINUTES} minutes`);
        setRemovalCount(0);
        setCooldownTimer(COOLDOWN_MINUTES * 60);
        setLastRemovalTime(now);
      } else {
        setRemovalCount(newRemovalCount);
      }
      
      console.log(`FavoritesContext: Updated local state immediately, now ${updatedFavorites.shows.length} favorites`);
      
      // Then update Firestore
      await updateDoc(userRef, {
        'profile.favoriteShows': arrayRemove(showId),
        'profile.lastRemovalTime': needsCooldown ? Timestamp.now() : (lastRemovalTime ? Timestamp.fromDate(lastRemovalTime) : null),
        'profile.weeklyRemovals': needsCooldown ? 0 : newRemovalCount
      });
      
      // Update showUsers collection
      await updateShowUsers(showId, false);
      
      console.log(`FavoritesContext: Successfully removed from Firestore`);
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Call success callback after both local and remote updates are complete
      if (onSuccess) setTimeout(() => onSuccess(), 0);
    } catch (error) {
      console.error('FavoritesContext: Error removing from favorites:', error);
      
      // Rollback local state on error
      refreshUserFavorites(); // Reload from Firestore to ensure consistency
      console.log(`FavoritesContext: Rolled back local state due to error by refreshing from Firestore`);
      
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