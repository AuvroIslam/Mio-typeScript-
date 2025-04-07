import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  Modal,
  
  Alert
} from 'react-native';
import {  useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { useMatch, MatchData as ContextMatchData } from '../../context/MatchContext';

import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
  setDoc,
  getDocs
} from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';

interface Conversation {
  id: string;
  participants: string[];
  participantNames: {[uid: string]: string};
  participantPhotos: {[uid: string]: string};
  lastMessage?: {
    text: string;
    timestamp: Timestamp;
  };
  unreadCount: {[uid: string]: number};
  createdAt?: Timestamp;
}

// NEW: Interface for blocked user data for display
interface BlockedUserInfo {
  userId: string;
  displayName: string;
  profilePic: string;
}

export default function InboxScreen() {
  const { user } = useAuth();
  const { matches: contextMatches, updateChattingWithStatus, blockedUsers, unblockUser } = useMatch();
  const router = useRouter();
  
 
  
  // Component state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [indexWarning, setIndexWarning] = useState(false);
  const [isBlockListVisible, setIsBlockListVisible] = useState(false); // <-- State for block list modal
  const [blockedUsersInfo, setBlockedUsersInfo] = useState<BlockedUserInfo[]>([]); // <-- State for detailed block list
  const [isLoadingBlockList, setIsLoadingBlockList] = useState(false); // <-- Loading state for block list details
  const [isUnblocking, setIsUnblocking] = useState<string | null>(null); // <-- Track which user is being unblocked
  
  // Filter available matches from the context
  const availableMatches = useMemo(() => {
    return contextMatches.filter((match: ContextMatchData) => !match.chattingWith);
  }, [contextMatches]);

  // Load user's conversations
  useEffect(() => {
    if (!user) return;
    
    setIsLoading(true);
    
    // Get user's conversations
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageTimestamp', 'desc')
    );
    
    let unsubscribe: () => void = () => {};
    
    try {
      unsubscribe = onSnapshot(q, (snapshot) => {
        const conversationList: Conversation[] = [];
        
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          const otherParticipant = data.participants.find((p: string) => p !== user.uid);
          
          if (otherParticipant) {
            // Safely extract and normalize necessary data
            const participantNames = data.participantNames || {};
            const participantPhotos = data.participantPhotos || {};
            const unreadCount = data.unreadCount || {};
            
            // Handle lastMessage carefully
            let lastMessageObj: { text: string; timestamp: Timestamp } | undefined;
            
            try {
              if (!data.lastMessage) {
                // No lastMessage at all
                lastMessageObj = undefined;
              } else if (typeof data.lastMessage === 'string') {
                // Old format: lastMessage is a string
                lastMessageObj = {
                  text: data.lastMessage,
                  timestamp: data.lastMessageTimestamp || Timestamp.now()
                };
                
                // Attempt to migrate old format to new format
                migrateConversationFormat(docSnapshot.id, data);
              } else if (typeof data.lastMessage === 'object') {
                // New format: lastMessage is an object
                if (typeof data.lastMessage.text === 'string') {
                  lastMessageObj = {
                    text: data.lastMessage.text,
                    timestamp: data.lastMessage.timestamp || data.lastMessageTimestamp || Timestamp.now()
                  };
                } else {
                  console.warn(`Invalid lastMessage.text for conversation ${docSnapshot.id}`);
                  lastMessageObj = {
                    text: 'Start a conversation!',
                    timestamp: data.lastMessageTimestamp || Timestamp.now()
                  };
                }
              } else {
                console.warn(`Unexpected lastMessage type for conversation ${docSnapshot.id}`);
                lastMessageObj = {
                  text: 'Start a conversation!',
                  timestamp: data.lastMessageTimestamp || Timestamp.now()
                };
              }
            } catch (error) {
              console.error(`Error processing lastMessage for conversation ${docSnapshot.id}:`, error);
              lastMessageObj = {
                text: 'Message unavailable',
                timestamp: Timestamp.now()
              };
            }
            
            // Create a sanitized conversation object
            conversationList.push({
              id: docSnapshot.id,
              participants: data.participants || [],
              participantNames: participantNames,
              participantPhotos: participantPhotos,
              lastMessage: lastMessageObj,
              unreadCount: unreadCount,
              createdAt: data.createdAt
            });
          }
        });
        
    
        setConversations(conversationList);
        setIndexWarning(false);
        setIsLoading(false);
      }, (error) => {
        // Handle permission error gracefully
        console.error("Error loading conversations:", error);
        // Check if this is an index error
        if (error.message?.includes('index')) {
          setIndexWarning(true);
        }
        setIsLoading(false);
      });
    } catch (error) {
      console.error("Error setting up conversations listener:", error);
      setIsLoading(false);
    }
    
    // Cleanup function
    return () => unsubscribe();
  }, [user]);
  
  const createConversation = async (match: ContextMatchData) => {
    if (!user) return;
    
    try {
      // Check if conversation already exists
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participants', 'array-contains', user.uid)
      );
      
      const querySnapshot = await getDocs(q);
      let existingConversationId = null;
      
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        if (data.participants.includes(match.userId)) {
          existingConversationId = docSnapshot.id;
        }
      });
      
      // Navigate to existing or new chat screen
      const conversationIdToNavigate = existingConversationId || await createNewConversationDocument(match);
      
      if (conversationIdToNavigate) {
        router.push({
          pathname: '/(conversations)/chat',
          params: { 
            conversationId: conversationIdToNavigate,
            fromInbox: 'true'
          }
        });
      }

    } catch (error) {
      console.error('Error finding or creating conversation:', error);
    }
  };
  
  const createNewConversationDocument = async (match: ContextMatchData): Promise<string | null> => {
    if (!user) return null;

    try {
      // Get current user's profile data
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userProfile = userDoc.data()?.profile || {};
      
        // Create new conversation document
      const newConversationRef = doc(collection(db, 'conversations'));
      await setDoc(newConversationRef, {
        participants: [user.uid, match.userId],
        participantNames: {
          [user.uid]: userProfile.displayName || 'You',
          [match.userId]: match.displayName
        },
        participantPhotos: {
          [user.uid]: userProfile.profilePic || '',
          [match.userId]: match.profilePic
        },
        lastMessage: {
          text: 'Start a conversation!',
          timestamp: Timestamp.now()
        },
        lastMessageTimestamp: Timestamp.now(),
        createdAt: Timestamp.now(),
        unreadCount: {
          [user.uid]: 0,
          [match.userId]: 0
        }
          // Add messageCount, currentBatchId etc. if needed by chat.tsx creation logic
      });
      
        // Update chattingWith status for both users
      await updateChattingWithStatus(match.userId);
      
        return newConversationRef.id;
    } catch (error) {
        console.error('Error creating new conversation document:', error);
        return null;
    }
  };
  

  
  // Function to truncate long messages
  const truncateText = (text: string, maxLength: number = 30): string => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };
  
  // Check if match is less than 24 hours old
  const isNewMatch = (matchTimestamp: any): boolean => {
    if (!matchTimestamp) return false;
    
    // Convert Firestore timestamp to Date if necessary
    const matchDate = matchTimestamp.toDate ? 
      matchTimestamp.toDate() : 
      new Date(matchTimestamp);
    
    const now = new Date();
    const timeDiff = now.getTime() - matchDate.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    return hoursDiff < 24;
  };
  
  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const otherParticipantId = item.participants.find(p => p !== user?.uid) || '';
    const otherParticipantName = item.participantNames?.[otherParticipantId] || 'User';
    const otherParticipantPhoto = item.participantPhotos?.[otherParticipantId] || '';
    
    const lastMessageText = typeof item.lastMessage?.text === 'string' 
      ? truncateText(item.lastMessage.text) 
      : 'No messages yet';
    
   
      
    const correspondingMatch = contextMatches.find((m: ContextMatchData) => m.userId === otherParticipantId);
    
    let shouldBlurImage = false;
    if (item.createdAt) {
      shouldBlurImage = isNewMatch(item.createdAt);
    } else if (correspondingMatch && correspondingMatch.matchTimestamp) {
      shouldBlurImage = isNewMatch(correspondingMatch.matchTimestamp);
    }
    
    return (
      <TouchableOpacity 
        style={styles.conversationItem}
        onPress={() => {
          router.push({
            pathname: '/(conversations)/chat',
            params: { 
              conversationId: item.id,
              fromInbox: 'true'
            }
          });
        }}
      >
        {shouldBlurImage ? (
          <View style={styles.conversationBlurContainer}>
            <Image 
              source={{ uri: otherParticipantPhoto || 'https://via.placeholder.com/60' }} 
              style={[styles.avatar, ]} 
              blurRadius={40}
            />
          </View>
        ) : (
          <Image 
            source={{ uri: otherParticipantPhoto || 'https://via.placeholder.com/60' }} 
            style={styles.avatar} 
          />
        )}
        
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={styles.userName}>{otherParticipantName}</Text>
          </View>
          
          <View style={styles.lastMessageContainer}>
            <Text 
              style={[
                styles.lastMessage,
                item.unreadCount && item.unreadCount[user?.uid || ''] > 0 && styles.unreadMessage
              ]}
              numberOfLines={1}
            >
              {lastMessageText}
            </Text>
            
            {item.unreadCount && item.unreadCount[user?.uid || ''] > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadCount}>
                  {item.unreadCount[user?.uid || '']}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  
  const renderMatchItem = ({ item }: { item: ContextMatchData }) => {
    const shouldBlurImage = isNewMatch(item.matchTimestamp);
    
    return (
      <TouchableOpacity 
        style={styles.matchItem}
        onPress={() => {
          createConversation(item);
        }}
      >
        <View style={styles.matchImageContainer}>
          {shouldBlurImage ? (
            <View style={styles.matchBlurContainer}>
              <Image 
                source={{ uri: item.profilePic || 'https://via.placeholder.com/60' }}
                style={[styles.matchAvatar, { opacity: 0.3 }]}
                blurRadius={15}
              />
            </View>
          ) : (
            <Image 
              source={{ uri: item.profilePic || 'https://via.placeholder.com/60' }} 
              style={styles.matchAvatar} 
            />
          )}
        </View>
        <Text style={styles.matchName} numberOfLines={1}>
          {item.displayName}
        </Text>
      </TouchableOpacity>
    );
  };
  
  const renderEmptyInbox = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubble-ellipses-outline" size={80} color={COLORS.secondary} />
      <Text style={styles.emptyTitle}>No Messages Yet</Text>
      <Text style={styles.emptyText}>
        Start a conversation with your matches by clicking on their profile in the matches row above!
      </Text>
    </View>
  );
  
  // Add the migration function to update old conversation formats
  const migrateConversationFormat = async (conversationId: string, oldData: any) => {
    if (!conversationId || typeof oldData.lastMessage !== 'string') return;
    
    try {
      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: {
          text: oldData.lastMessage || 'Start a conversation!',
          timestamp: oldData.lastMessageTimestamp || Timestamp.now()
        }
      });
    
    } catch (error) {
      console.error(`Error migrating conversation ${conversationId}:`, error);
    }
  };
  
  // Fix the renderWarning component
  const renderWarningMessage = () => {
    if (!indexWarning) return null;
    
    return (
      <View style={styles.warningContainer}>
        <Text style={styles.warningTitle}>Database Index Required</Text>
        <Text style={styles.warningText}>
          Please create the required index in your Firebase console to enable conversation sorting.
        </Text>
      </View>
    );
  };
  
  // --- NEW: Fetch Blocked User Details ---
  const fetchBlockedUsersDetails = useCallback(async () => {
    if (!user || blockedUsers.length === 0) {
        setBlockedUsersInfo([]);
        return;
    }

    setIsLoadingBlockList(true);
    try {
        const userPromises = blockedUsers.map(userId => getDoc(doc(db, 'users', userId)));
        const userDocs = await Promise.all(userPromises);

        const detailedList: BlockedUserInfo[] = userDocs
            .filter(docSnapshot => docSnapshot.exists()) // Only include users that still exist
            .map(docSnapshot => {
                const data = docSnapshot.data();
                const profile = data?.profile || {};
                return {
                    userId: docSnapshot.id,
                    displayName: profile.displayName || 'Unknown User',
                    profilePic: profile.profilePic || '' // Add a default placeholder if needed
                };
            });

        setBlockedUsersInfo(detailedList);
    } catch (error) {
        console.error("Error fetching blocked users details:", error);
        Alert.alert("Error", "Could not load block list details.");
    } finally {
        setIsLoadingBlockList(false);
    }
  }, [user, blockedUsers]); // Depend on context's blockedUsers array

  // --- NEW: Handle Unblock Action ---
   const handleUnblock = (userIdToUnblock: string) => {
        if (isUnblocking) return; // Prevent multiple clicks

        Alert.alert(
            "Unblock User",
            `Are you sure you want to unblock this user? They will be able to match with you again.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Unblock",
                    style: "default",
                    onPress: async () => {
                        setIsUnblocking(userIdToUnblock);
                        try {
                            await unblockUser(userIdToUnblock);
                            // Refresh the detailed list after successful unblock
                            // Note: fetchBlockedUsersDetails will run automatically
                            // if 'blockedUsers' dependency in its useCallback is correct
                            // and if unblockUser updates the context's blockedUsers state.
                            // We might need an explicit refresh if context updates are slow.
                            // For now, assume context update triggers refresh.
                        } catch (error) {
                            console.error("Unblock failed:", error);
                            Alert.alert("Error", "Failed to unblock user. Please try again.");
                        } finally {
                            setIsUnblocking(null);
                        }
                    },
                },
            ]
        );
    };

  // --- NEW: Effect to load block list details when modal opens ---
  useEffect(() => {
      if (isBlockListVisible && user) {
          fetchBlockedUsersDetails();
      }
  }, [isBlockListVisible, user, fetchBlockedUsersDetails]); // Rerun when modal opens or user/details fetch fn changes

  // --- NEW: Render Blocked User Item ---
  const renderBlockedUserItem = ({ item }: { item: BlockedUserInfo }) => (
    <View style={styles.blockedUserItem}>
        <Image
            source={{ uri: item.profilePic || 'https://via.placeholder.com/40' }}
            style={styles.blockedAvatar}
        />
        <Text style={styles.blockedUserName} numberOfLines={1}>{item.displayName}</Text>
        <TouchableOpacity
            style={[styles.unblockButton, isUnblocking === item.userId && styles.unblockButtonDisabled]}
            onPress={() => handleUnblock(item.userId)}
            disabled={!!isUnblocking} // Disable all buttons if any unblock is in progress
        >
            {isUnblocking === item.userId ? (
                <ActivityIndicator size="small" color={COLORS.secondary} />
            ) : (
                <Text style={styles.unblockButtonText}>Unblock</Text>
            )}
        </TouchableOpacity>
    </View>
  );
  
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* NEW: Header with Options Button */}
      <View style={styles.header}>
          <Text style={styles.headerTitle}>Inbox</Text>
          <TouchableOpacity
              style={styles.optionsButton}
              onPress={() => setIsBlockListVisible(true)} // Open block list modal
          >
              <Ionicons name="ellipsis-vertical" size={24} color={COLORS.darkestMaroon} />
          </TouchableOpacity>
      </View>
      
      {indexWarning && renderWarningMessage()}
      
      {/* Matches row */}
      <View>
        <Text style={styles.sectionTitle}>Your Matches</Text>
        <FlatList<ContextMatchData>
          data={availableMatches}
          keyExtractor={(item) => item.userId}
          renderItem={renderMatchItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.matchesContainer}
          ListEmptyComponent={
            <Text style={styles.noMatchesText}>No available matches to chat with.</Text>
          }
        />
      </View>
      
      {/* Always show the conversations list now */}
        <>
          <Text style={styles.sectionTitle}>Conversations</Text>
          {conversations.length > 0 ? (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={renderConversationItem}
              contentContainerStyle={styles.conversationsContainer}
            />
          ) : (
            renderEmptyInbox()
          )}
        </>

       {/* NEW: Block List Modal */}
       <Modal
            animationType="slide"
            transparent={true}
            visible={isBlockListVisible}
            onRequestClose={() => setIsBlockListVisible(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Blocked Users</Text>
                        <TouchableOpacity onPress={() => setIsBlockListVisible(false)}>
                            <Ionicons name="close" size={28} color={COLORS.darkestMaroon} />
                        </TouchableOpacity>
                    </View>

                    {isLoadingBlockList ? (
                        <ActivityIndicator size="large" color={COLORS.secondary} style={{marginTop: 30}}/>
                    ) : blockedUsersInfo.length === 0 ? (
                        <Text style={styles.emptyBlockListText}>You haven't blocked anyone yet.</Text>
                    ) : (
                        <FlatList
                            data={blockedUsersInfo}
                            keyExtractor={(item) => item.userId}
                            renderItem={renderBlockedUserItem}
                            style={styles.blockList}
                        />
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
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  header: { // New Header style
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 15, // Adjusted padding
      borderBottomWidth: 1,
      borderBottomColor: '#e5e5e5',
      backgroundColor: '#fff', // Added background
  },
  headerTitle: { // New Header Title style
      fontSize: 24,
      fontWeight: 'bold',
      color: COLORS.darkestMaroon,
  },
  optionsButton: { // New Options Button style
      padding: 5, // Make it easier to tap
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondary,
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 10,
  },
  matchesContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  matchItem: {
    alignItems: 'center',
    marginHorizontal: 5,
    width: 80,
  },
  matchImageContainer: {
    position: 'relative',
  },
  matchAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: .5,
    borderColor: COLORS.secondary,
  },
  matchBlurContainer: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: .5,
    borderColor: COLORS.secondary,
  },
  matchName: {
    marginTop: 5,
    fontSize: 12,
    textAlign: 'center',
    color: COLORS.darkestMaroon,
    width: 70,
  },
  noMatchesText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    marginLeft: 20,
    paddingVertical: 15,
  },
  conversationsContainer: {
    paddingHorizontal: 20,
    paddingTop: 5,
    paddingBottom: 20,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  conversationContent: {
    flex: 1,
    marginLeft: 12,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  lastMessageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  unreadMessage: {
    fontWeight: '600',
    color: '#333',
  },
  unreadBadge: {
    backgroundColor: COLORS.secondary,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  unreadCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginTop: 20,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  warningContainer: {
    margin: 10,
    padding: 15,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffeeba',
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 5,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  conversationBlurContainer: {
    position: 'relative',
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
  },
  // Styles for Block List Modal
  modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end', // Position modal at the bottom
  },
  modalContainer: {
      backgroundColor: 'white',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: '70%', // Limit modal height
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
      elevation: 10,
  },
  modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      paddingBottom: 10,
  },
  modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: COLORS.darkestMaroon,
  },
  blockList: {
      flexGrow: 0, // Prevent FlatList from taking full height
  },
  blockedUserItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#f0f0f0',
  },
  blockedAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 15,
  },
  blockedUserName: {
      flex: 1, // Take available space
      fontSize: 16,
      color: '#333',
      marginRight: 10,
  },
  unblockButton: {
      backgroundColor: COLORS.secondary,
      paddingVertical: 8,
      paddingHorizontal: 15,
      borderRadius: 20,
  },
  unblockButtonDisabled: {
      opacity: 0.5,
      backgroundColor: '#ccc', // Grey out when disabled
  },
  unblockButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '500',
  },
  emptyBlockListText: {
      textAlign: 'center',
      fontSize: 16,
      color: '#888',
      marginTop: 30,
      marginBottom: 20,
  },
});