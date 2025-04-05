import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { useMatch } from '../../context/MatchContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  getDoc, 
  updateDoc, 
  arrayUnion, 
  Timestamp,
  getDocs,
  limit,
  writeBatch,
  increment,
  startAfter
} from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { logoutEventEmitter, LOGOUT_EVENT } from '../../context/AuthContext';

// Constants to optimize Firestore usage
const MESSAGES_PER_BATCH = 10; // Number of messages to fetch per pagination
const MESSAGE_BATCH_SIZE = 20; // Number of messages to batch before creating a new document
const CACHE_EXPIRY = 3600000; // Cache expiry time in milliseconds (1 hour)

interface Message {
  id?: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: Timestamp;
  read: boolean;
}

interface MessageBatch {
  id: string;
  messages: Message[];
  startTime: Timestamp;
  endTime: Timestamp;
}

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
  currentBatchId?: string; // Track current batch for more efficient writes
  messageCount?: number; // Track total message count
}

// Custom hook for managing messages
function useMessages(conversation: Conversation | null, user: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(true);
  const [lastVisible, setLastVisible] = useState<any>(null);
  
  // Load messages with pagination
  const loadMessages = useCallback(async (convId: string, loadMore = false) => {
    if (isLoadingMore || (!loadMore && messages.length > 0)) return;
    
    try {
      setIsLoadingMore(true);
      
      // Query message batches instead of individual messages
      const batchesRef = collection(db, `conversations/${convId}/messageBatches`);
      let q = query(batchesRef, orderBy('endTime', 'desc'), limit(MESSAGES_PER_BATCH));
      
      // If loading more, start after the last visible item
      if (loadMore && lastVisible) {
        q = query(batchesRef, orderBy('endTime', 'desc'), limit(MESSAGES_PER_BATCH), 
          // @ts-ignore - Type issue with startAfter
          startAfter(lastVisible));
      }
      
      const querySnapshot = await getDocs(q);
      const batches: MessageBatch[] = [];
      let lastDoc = null;
      
      if (!querySnapshot.empty) {
        querySnapshot.forEach((doc) => {
          const batchData = doc.data() as MessageBatch;
          batchData.id = doc.id;
          batches.push(batchData);
        });
        lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
      }
      
      // Process and flatten message batches
      const allMessages: Message[] = [];
      batches.forEach(batch => {
        if (batch.messages && Array.isArray(batch.messages)) {
          batch.messages.forEach(msg => allMessages.push(msg));
        }
      });
      
      // Sort messages by timestamp
      allMessages.sort((a, b) => {
        const timeA = a.timestamp.toMillis();
        const timeB = b.timestamp.toMillis();
        return timeA - timeB;
      });
      
      // Update state
      if (loadMore) {
        setMessages(prev => [...prev, ...allMessages]);
      } else {
        setMessages(allMessages);
      }
      
      setLastVisible(lastDoc);
      setCanLoadMore(querySnapshot.size >= MESSAGES_PER_BATCH);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, messages.length, lastVisible]);
  
  // Add a single message
  const addMessage = useCallback((newMessage: Message) => {
    setMessages(prevMessages => [...prevMessages, newMessage]);
  }, []);
  
  // Load more messages
  const loadMoreMessages = useCallback(() => {
    if (!conversation || !canLoadMore || isLoadingMore) return;
    loadMessages(conversation.id, true);
  }, [conversation, canLoadMore, isLoadingMore, loadMessages]);
  
  return {
    messages,
    isLoadingMore,
    canLoadMore,
    loadMessages,
    addMessage,
    loadMoreMessages
  };
}

export default function ChatScreen() {
  const { user } = useAuth();
  const {  unmatchUser, blockUser, moveToChattingWith, isNewMatch, chattingWith } = useMatch();
  const params = useLocalSearchParams();
  const conversationId = params.conversationId as string;
  const matchId = params.matchId as string; // User ID we want to chat with (from profile)
  const fromInbox = params.fromInbox as string;
  
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [otherUser, setOtherUser] = useState<{id: string, name: string, photo: string, matchTimestamp?: any}>({
    id: '',
    name: 'User',
    photo: ''
  });
  const [unsubscribeConversation, setUnsubscribeConversation] = useState<() => void | null>(() => null);
  const [unsubscribeMessages, setUnsubscribeMessages] = useState<() => void | null>(() => null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isUnmatching, setIsUnmatching] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  
  // Cache reference
  const cachedConversationId = useRef<string | null>(null);
  
  // Use the custom messages hook
  const { 
    messages, 
    isLoadingMore,
    canLoadMore,
    loadMessages,
    addMessage,
    loadMoreMessages 
  } = useMessages(conversation, user);
  
  // Reference to the FlatList for scrolling
  const flatListRef = useRef<FlatList>(null);

  // Function to scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);
  
  // Auto-scroll when new messages are added
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);
  
  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeConversation) unsubscribeConversation();
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, [unsubscribeConversation, unsubscribeMessages]);
  
  // Initialize or load existing conversation
  useEffect(() => {
    if (!user) return;
    
    const initializeChat = async () => {
      setIsLoading(true);
      
      try {
        // If we have a conversation ID, just load that conversation
        if (conversationId) {
          await loadExistingConversation(conversationId);
          return;
        }
        
        // If we have a matchId, check if a conversation exists or create a new one
        if (matchId) {
          const existingConversationId = await findOrCreateConversation(matchId);
          if (existingConversationId) {
            await loadExistingConversation(existingConversationId);
            
            // Move the match to chattingWith since we're starting a conversation
            await moveToChattingWith(matchId);
          }
        }
      } catch (error) {
        console.error('Error initializing chat:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeChat();
    
    // Clean up on unmount
    return () => {
      if (cachedConversationId.current) {
        // Store last read time in AsyncStorage to reduce unnecessary reads
        const lastReadKey = `lastRead_${cachedConversationId.current}_${user.uid}`;
        AsyncStorage.setItem(lastReadKey, new Date().toISOString());
      }
    };
  }, [user, conversationId, matchId, moveToChattingWith]);
  
  // Find existing conversation or create a new one
  const findOrCreateConversation = async (otherUserId: string) => {
    if (!user) return null;
    
    try {
      // Check cache first
      const cacheKey = `conversation_${user.uid}_${otherUserId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (cachedData) {
        const { conversationId, timestamp } = JSON.parse(cachedData);
        const cacheAge = Date.now() - timestamp;
        
        if (cacheAge < CACHE_EXPIRY) {
          try {
            // Verify the conversation still exists and user has access
            const conversationDoc = await getDoc(doc(db, 'conversations', conversationId));
            if (conversationDoc.exists()) {
              return conversationId;
            } else {
              // Conversation no longer exists, clear cache
              await AsyncStorage.removeItem(cacheKey);
            }
          } catch (error) {
            console.log("Error checking cached conversation:", error);
            // Clear invalid cache if we get permission errors
            await AsyncStorage.removeItem(cacheKey);
          }
        }
      }
      
      // Check if conversation already exists
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participants', 'array-contains', user.uid)
      );
      
      let existingConversationId: string | null = null;
      
      try {
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          if (data.participants && data.participants.includes(otherUserId)) {
            existingConversationId = docSnapshot.id;
          }
        });
        
        if (existingConversationId) {
          // Update cache
          await AsyncStorage.setItem(cacheKey, JSON.stringify({
            conversationId: existingConversationId,
            timestamp: Date.now()
          }));
          return existingConversationId;
        }
      } catch (error) {
        console.error("Error querying conversations:", error);
        // Don't return here, continue to create a new conversation
      }
      
      // Get user information for both participants
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
      
      if (!userDoc.exists() || !otherUserDoc.exists()) {
        console.error('Could not find user information');
        return null;
      }
      
      const userData = userDoc.data().profile || {};
      const otherUserData = otherUserDoc.data().profile || {};
      
      // Create batch for more efficient writes
      const batch = writeBatch(db);
      
      // Create new conversation
      const newConversationRef = doc(collection(db, 'conversations'));
      const now = Timestamp.now();
      const conversationData = {
        participants: [user.uid, otherUserId],
        participantNames: {
          [user.uid]: userData.displayName || 'You',
          [otherUserId]: otherUserData.displayName || 'User'
        },
        participantPhotos: {
          [user.uid]: userData.profilePic || '',
          [otherUserId]: otherUserData.profilePic || ''
        },
        lastMessage: {
          text: 'Start a conversation!',
          timestamp: now
        },
        lastMessageTimestamp: now,
        createdAt: now,
        unreadCount: {
          [user.uid]: 0,
          [otherUserId]: 0
        },
        messageCount: 0,
        currentBatchId: null
      };
      
      // Set the conversation document
      batch.set(newConversationRef, conversationData);
      
      // Commit the batch
      await batch.commit();
      
      // Update cache
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        conversationId: newConversationRef.id,
        timestamp: Date.now()
      }));
      
      return newConversationRef.id;
    } catch (error) {
      console.error('Error finding or creating conversation:', error);
      return null;
    }
  };
  
  // Load an existing conversation
  const loadExistingConversation = async (id: string) => {
    if (!user) return;
    
    try {
      // Set cached conversation ID
      cachedConversationId.current = id;
      
      // Listen for conversation updates - using onSnapshot only for real-time critical data
      const unsub = onSnapshot(
        doc(db, 'conversations', id), 
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            const conversationData = docSnapshot.data() as Conversation;
            conversationData.id = docSnapshot.id;
            setConversation(conversationData);
            
            // Set other user's information
            const otherParticipantId = conversationData.participants.find(p => p !== user.uid) || '';
            setOtherUser({
              id: otherParticipantId,
              name: conversationData.participantNames[otherParticipantId] || 'User',
              photo: conversationData.participantPhotos[otherParticipantId] || '',
              matchTimestamp: conversationData.lastMessage?.timestamp
            });
            
            // Mark messages as read if needed
            const unreadCount = conversationData.unreadCount?.[user.uid] || 0;
            if (unreadCount > 0) {
              markMessagesAsRead(id);
            }
          }
          
          // Only load messages if they haven't been loaded yet
          if (messages.length === 0) {
            loadMessages(id);
          }
        },
        (error) => {
          console.error('Error listening to conversation:', error);
          
          // Handle permission errors by removing from cache and redirecting
          if (error.code === 'permission-denied' && user) {
            const otherParticipantId = otherUser.id;
            if (otherParticipantId) {
              const cacheKey = `conversation_${user.uid}_${otherParticipantId}`;
              AsyncStorage.removeItem(cacheKey).then(() => {
                // Navigate back to inbox
                Alert.alert(
                  "Access Error", 
                  "You no longer have access to this conversation. Returning to inbox.",
                  [{ text: "OK", onPress: () => router.replace('/(tabs)/inbox') }]
                );
              });
            } else {
              router.replace('/(tabs)/inbox');
            }
          }
          
          setIsLoading(false);
        }
      );
      
      setUnsubscribeConversation(() => unsub);
    } catch (error) {
      console.error('Error loading conversation:', error);
      setIsLoading(false);
    }
  };
  
  // Mark messages as read
  const markMessagesAsRead = async (convId: string) => {
    if (!user) return;
    
    try {
      // Just update the unread count in conversation document
      await updateDoc(doc(db, 'conversations', convId), {
        [`unreadCount.${user.uid}`]: 0
      });
      
      // Store last read time in AsyncStorage
      const lastReadKey = `lastRead_${convId}_${user.uid}`;
      await AsyncStorage.setItem(lastReadKey, new Date().toISOString());
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };
  
  // Send a message
  const sendMessage = async () => {
    if (!user || !conversation || !messageText.trim()) return;
    
    try {
      const messageText_cleaned = messageText.trim();
      setMessageText(''); // Clear input field immediately for better UX
      
      // Get the other participant
      const otherParticipant = conversation.participants.find(p => p !== user.uid) || '';
      
      // Get or create a message batch
      const now = Timestamp.now();
      let currentBatchId = conversation.currentBatchId;
      let messageCount = conversation.messageCount || 0;
      let shouldCreateNewBatch = false;
      
      // Check if we need to create a new batch
      if (!currentBatchId || messageCount % MESSAGE_BATCH_SIZE === 0) {
        shouldCreateNewBatch = true;
        currentBatchId = doc(collection(db, `conversations/${conversation.id}/messageBatches`)).id;
      }
      
      // Create the message object
      const newMessage: Message = {
        senderId: user.uid,
        senderName: conversation.participantNames[user.uid],
        text: messageText_cleaned,
        timestamp: now,
        read: false
      };
      
      // Create a batch write for efficiency
      const batch = writeBatch(db);
      
      // Update local state first for immediate feedback - before the async Firestore operation
      addMessage(newMessage);
      
      // Update local conversation state to prevent reload
      setConversation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          currentBatchId: currentBatchId,
          messageCount: (prev.messageCount || 0) + 1,
          lastMessage: {
            text: messageText_cleaned,
            timestamp: now
          },
          lastMessageTimestamp: now,
          unreadCount: {
            ...prev.unreadCount,
            [otherParticipant]: (prev.unreadCount?.[otherParticipant] || 0) + 1
          }
        };
      });
      
      if (shouldCreateNewBatch) {
        // Create a new message batch
        const batchRef = doc(db, `conversations/${conversation.id}/messageBatches`, currentBatchId);
        batch.set(batchRef, {
          messages: [newMessage],
          startTime: now,
          endTime: now
        });
        
        // Update conversation with new batch ID
        batch.update(doc(db, 'conversations', conversation.id), {
          currentBatchId: currentBatchId,
          messageCount: increment(1),
          lastMessage: {
            text: messageText_cleaned,
            timestamp: now
          },
          lastMessageTimestamp: now,
          [`unreadCount.${otherParticipant}`]: increment(1)
        });
      } else {
        // Update existing batch
        const batchRef = doc(db, `conversations/${conversation.id}/messageBatches`, currentBatchId);
        batch.update(batchRef, {
          messages: arrayUnion(newMessage),
          endTime: now
        });
        
        // Update conversation
        batch.update(doc(db, 'conversations', conversation.id), {
          messageCount: increment(1),
          lastMessage: {
            text: messageText_cleaned,
            timestamp: now
          },
          lastMessageTimestamp: now,
          [`unreadCount.${otherParticipant}`]: increment(1)
        });
      }
      
      // Commit the batch in the background
      await batch.commit();
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };
  
  // Format message timestamp
  const formatMessageTime = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      // Today, show time
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      // Yesterday
      return 'Yesterday';
    } else if (diffDays < 7) {
      // This week, show day name
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      // Older, show date
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };
  
  // Render a message item
  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.senderId === user?.uid;
    
    // Ensure we're only rendering string text
    const messageText = typeof item.text === 'string' ? item.text : 'Message unavailable';
    const timeString = item.timestamp ? formatMessageTime(item.timestamp) : '';
    
    return (
      <View style={[
        styles.messageContainer,
        isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer
      ]}>
        <View style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble
        ]}>
          <Text style={[
            styles.messageText,
            isOwnMessage ? styles.ownMessageText : styles.otherMessageText
          ]}>
            {messageText}
          </Text>
        </View>
        <Text style={styles.messageTime}>
          {timeString}
        </Text>
      </View>
    );
  };
  
  const handleUnmatch = async () => {
    if (!otherUser.id) return;
    
    Alert.alert(
      "Unmatch",
      `Are you sure you want to unmatch with ${otherUser.name}? This will delete your conversation and remove them from your matches.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Unmatch", 
          style: "destructive",
          onPress: async () => {
            try {
              setIsUnmatching(true);
              
              // Clear conversation cache for this user
              if (user) {
                const cacheKey = `conversation_${user.uid}_${otherUser.id}`;
                await AsyncStorage.removeItem(cacheKey);
              }
              
              // Clean up listeners before unmatch to prevent errors
              if (unsubscribeConversation) unsubscribeConversation();
              if (unsubscribeMessages) unsubscribeMessages();
              
              await unmatchUser(otherUser.id);
              router.replace('/(tabs)/inbox');
            } catch (error) {
              console.error('Error unmatching user:', error);
              Alert.alert('Error', 'Failed to unmatch user. Please try again.');
            } finally {
              setIsUnmatching(false);
            }
          }
        }
      ]
    );
  };
  
  const handleBlock = async () => {
    if (!otherUser.id) return;
    
    Alert.alert(
      "Block User",
      `Are you sure you want to block ${otherUser.name}? They will be removed from your matches and you won't be matched with them in the future.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Block", 
          style: "destructive",
          onPress: async () => {
            try {
              setIsBlocking(true);
              
              // Clear conversation cache for this user
              if (user) {
                const cacheKey = `conversation_${user.uid}_${otherUser.id}`;
                await AsyncStorage.removeItem(cacheKey);
              }
              
              // Clean up listeners before block to prevent errors
              if (unsubscribeConversation) unsubscribeConversation();
              if (unsubscribeMessages) unsubscribeMessages();
              
              await blockUser(otherUser.id);
              router.replace('/(tabs)/inbox');
            } catch (error) {
              console.error('Error blocking user:', error);
              Alert.alert('Error', 'Failed to block user. Please try again.');
            } finally {
              setIsBlocking(false);
            }
          }
        }
      ]
    );
  };
  
  // Render the options menu
  const renderOptionsMenu = () => {
    return (
      <Modal
        visible={showOptionsMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOptionsMenu(false)}
        >
          <View style={styles.optionsContainer}>
            <TouchableOpacity 
              style={styles.optionItem}
              onPress={() => {
                setShowOptionsMenu(false);
                handleUnmatch();
              }}
              disabled={isUnmatching}
            >
              {isUnmatching ? (
                <ActivityIndicator size="small" color={COLORS.secondary} style={styles.optionIcon} />
              ) : (
                <Ionicons name="person-remove" size={24} color={COLORS.secondary} style={styles.optionIcon} />
              )}
              <Text style={styles.optionText}>Unmatch</Text>
            </TouchableOpacity>
            
            <View style={styles.optionDivider} />
            
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                setShowOptionsMenu(false);
                handleBlock();
              }}
              disabled={isBlocking}
            >
              {isBlocking ? (
                <ActivityIndicator size="small" color={COLORS.error} style={styles.optionIcon} />
              ) : (
                <Ionicons name="ban" size={24} color={COLORS.error} style={styles.optionIcon} />
              )}
              <Text style={[styles.optionText, { color: COLORS.error }]}>Block User</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };
  
  const backToInbox = () => {
    // Clean up before navigating away
    if (user && otherUser.id) {
      const cacheKey = `conversation_${user.uid}_${otherUser.id}`;
      
      // Check if conversation exists before navigating
      if (conversation) {
        // Only store last read time for valid conversations
        const lastReadKey = `lastRead_${conversation.id}_${user.uid}`;
        AsyncStorage.setItem(lastReadKey, new Date().toISOString());
      } else {
        // If no conversation, clear any cached conversation IDs
        AsyncStorage.removeItem(cacheKey);
      }
    }
    
    // Navigate based on where the user came from
    if (fromInbox === 'true') {
      router.replace('/(tabs)/inbox');
    } else {
      router.back();
    }
  };
  
  // Add this useEffect for logout handling after the other useEffects
  useEffect(() => {
    const handleLogout = () => {
      // Clean up all Firebase listeners when user logs out
      if (unsubscribeConversation) unsubscribeConversation();
      if (unsubscribeMessages) unsubscribeMessages();
    };

    // Listen for logout events
    logoutEventEmitter.addListener(LOGOUT_EVENT, handleLogout);

    // Clean up
    return () => {
      logoutEventEmitter.removeListener(LOGOUT_EVENT, handleLogout);
    };
  }, [unsubscribeConversation, unsubscribeMessages]);
  
  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Options Menu Modal */}
      {renderOptionsMenu()}
      
      {/* Chat header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={backToInbox}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => {
            if (otherUser.id) {
              // First try to find the user in matches array
              let matchData = chattingWith.find(chat => chat.userId === otherUser.id);
              
              // If not found in matches, check in chattingWith array
              
              
              if (matchData) {
                // Ensure consistent timestamp handling
                let timestampString = '';
                if (matchData.matchTimestamp) {
                  // Handle Firestore timestamp
                  if (matchData.matchTimestamp.toDate) {
                    timestampString = matchData.matchTimestamp.toDate().toISOString();
                  } 
                  // Handle Date object
                  else if (matchData.matchTimestamp instanceof Date) {
                    timestampString = matchData.matchTimestamp.toISOString();
                  }
                  // Handle string
                  else if (typeof matchData.matchTimestamp === 'string') {
                    timestampString = matchData.matchTimestamp;
                  }
                }
                
                router.push({
                  pathname: '/(common)/userProfile',
                  params: { 
                    userId: otherUser.id,
                    matchLevel: matchData.matchLevel,
                    commonShows: matchData.commonShowIds.join(','),
                    favoriteShows: matchData.favoriteShowIds ? matchData.favoriteShowIds.join(',') : '',
                    matchTimestamp: timestampString
                  }
                });
              } else {
                router.push({
                  pathname: '/(common)/userProfile',
                  params: { userId: otherUser.id }
                });
              }
            }
          }}
        >
          <View style={styles.avatarContainer}>
            {isNewMatch(otherUser.matchTimestamp) ? (
              <View style={styles.avatarBlurContainer}>
                <Image 
                  source={{ uri: otherUser.photo || 'https://via.placeholder.com/40' }} 
                  style={[styles.avatar,]}
                  blurRadius={40}
                />
               
              </View>
            ) : (
              <Image 
                source={{ uri: otherUser.photo || 'https://via.placeholder.com/40' }} 
                style={styles.avatar} 
              />
            )}
          </View>
          <Text style={styles.userName}>{otherUser.name}</Text>
        </TouchableOpacity>
        
        {/* Options Button */}
        <TouchableOpacity 
          style={styles.optionsButton}
          onPress={() => setShowOptionsMenu(true)}
        >
          <Ionicons name="ellipsis-vertical" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
      </View>
      
      {/* Messages */}
      <KeyboardAvoidingView 
        style={styles.chatContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {canLoadMore && (
          <TouchableOpacity 
            style={styles.loadMoreButton} 
            onPress={loadMoreMessages}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <ActivityIndicator size="small" color={COLORS.secondary} />
            ) : (
              <Text style={styles.loadMoreText}>Load earlier messages</Text>
            )}
          </TouchableOpacity>
        )}
        
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) => item.id || `${item.timestamp.toString()}-${index}`}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesContainer}
          onContentSizeChange={scrollToBottom}
          onLayout={scrollToBottom}
          inverted={false}
          onEndReached={loadMoreMessages}
          onEndReachedThreshold={0.1}
        />
        
        {/* Message input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={messageText}
            onChangeText={setMessageText}
            multiline
          />
          <TouchableOpacity 
            style={[
              styles.sendButton,
              !messageText.trim() && styles.disabledSendButton
            ]}
            onPress={sendMessage}
            disabled={!messageText.trim()}
          >
            <Ionicons name="send" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  profileButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    position: 'relative',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  avatarBlurContainer: {
    position: 'relative',
    width: 40,
    height: 40,
    overflow: 'hidden',
    borderRadius: 20,
  },

  userName: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
    color: '#333',
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
    paddingBottom: 20,
  },
  messageContainer: {
    marginBottom: 16,
    maxWidth: '80%',
  },
  ownMessageContainer: {
    alignSelf: 'flex-end',
  },
  otherMessageContainer: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    borderRadius: 18,
    padding: 12,
    marginBottom: 4,
  },
  ownMessageBubble: {
    backgroundColor: COLORS.secondary,
  },
  otherMessageBubble: {
    backgroundColor: '#e9e9e9',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 12,
    color: '#888',
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    backgroundColor: '#f2f2f2',
    borderRadius: 20,
    padding: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: COLORS.secondary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  disabledSendButton: {
    opacity: 0.5,
  },
  loadMoreButton: {
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    margin: 10,
  },
  loadMoreText: {
    color: COLORS.secondary,
    fontWeight: '600',
  },
  optionsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  optionsContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  optionIcon: {
    marginRight: 16,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  optionDivider: {
    height: 1,
    backgroundColor: '#e5e5e5',
    marginVertical: 8,
  },
}); 