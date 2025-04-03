import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  TextInput,
  Modal,
  Alert
} from 'react-native';
import {  useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { useMatch } from '../../context/MatchContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logoutEventEmitter, LOGOUT_EVENT } from '../../context/AuthContext';

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
  getDocs,
  
} from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';

interface Message {
  id?: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: Timestamp;
  read: boolean;
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
}

interface MatchData {
  userId: string;
  displayName: string;
  profilePic: string;
  matchTimestamp?: any;
  // Add other properties as needed
}

export default function InboxScreen() {
  const { user } = useAuth();
  const router = useRouter();


  
  const { matches, chattingWith, blockedUsers, unblockUser, moveToChattingWith, isNewMatch } = useMatch();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const [showBlockedUsers, setShowBlockedUsers] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [indexWarning, setIndexWarning] = useState(false);
  
  // Create a deduplicated list of matches and chattingWith
  // Use a Map to ensure we don't have duplicate user IDs
  
  
  // Add matches first
 
  
  // Convert back to array
 
  
  // Instead of the local variable in loadConversations, add a state variable
  const [unsubscribeListener, setUnsubscribeListener] = useState<(() => void) | null>(null);
  
  // Load user's matches and conversations
  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);
  
  // Load conversations function
  const loadConversations = useCallback(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    
    // Get user's conversations
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageTimestamp', 'desc')
    );
    
    // Instead of using let unsubscribe, use the state setter
    try {
      // Clear any existing listener first
      if (unsubscribeListener) {
        unsubscribeListener();
        setUnsubscribeListener(null);
      }
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
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
              unreadCount: unreadCount
            });
          }
        });
        
        setConversations(conversationList);
        setIndexWarning(false);
        setIsLoading(false);
      }, (error) => {
        // Handle permission error gracefully
        console.error("Error loading conversations:", error);
        
        // Don't show index errors if there's a permission error
        if (error.code === 'permission-denied') {
          console.log('Permission denied error - user may be logged out');
          setConversations([]);
        }
        // Only set index warning for actual index errors
        else if (error.message?.includes('index')) {
          setIndexWarning(true);
        }
        
        setIsLoading(false);
      });
      
      // Set the unsubscribe function to state
      setUnsubscribeListener(() => unsubscribe);
    } catch (error) {
      console.error("Error setting up conversations listener:", error);
      setIsLoading(false);
    }
  }, [user, unsubscribeListener]);
  
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
  
  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConversation || !user) return;
    
    const messagesRef = collection(db, `conversations/${selectedConversation.id}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messageList: Message[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        messageList.push({
          id: doc.id,
          text: data.text,
          senderId: data.senderId,
          senderName: data.senderName,
          timestamp: data.timestamp,
          read: data.read
        });
      });
      
      setMessages(messageList);
      
      // Mark messages as read
      markMessagesAsRead();
    });
    
    return () => unsubscribe();
  }, [selectedConversation, user]);
  
  const markMessagesAsRead = async () => {
    if (!selectedConversation || !user) return;
    
    try {
      // Update unread count to 0 for current user
      await updateDoc(doc(db, 'conversations', selectedConversation.id), {
        [`unreadCount.${user.uid}`]: 0
      });
      
      // Mark all messages as read
      const messagesRef = collection(db, `conversations/${selectedConversation.id}/messages`);
      const q = query(
        messagesRef, 
        where('senderId', '!=', user.uid),
        where('read', '==', false)
      );
      
      const querySnapshot = await getDocs(q);
      
      querySnapshot.forEach(async (docSnapshot) => {
        await updateDoc(docSnapshot.ref, { read: true });
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };
  
  const createConversation = async (match: MatchData) => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      
      // Check if conversation already exists
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participants', 'array-contains', user.uid)
      );
      
      const querySnapshot = await getDocs(q);
      let existingConversationId: string | null = null;
      
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        if (data.participants && data.participants.includes(match.userId)) {
          existingConversationId = docSnapshot.id;
        }
      });
      
      if (existingConversationId) {
        setSelectedConversation(conversations.find(c => c.id === existingConversationId) || null);
        // Move match to chattingWith array even for existing conversations
        moveToChattingWith(match.userId);
        setIsLoading(false);
        return;
      }
      
      // Get current user's profile data (we need this for the profile picture)
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userProfile = userDoc.data()?.profile || {};
      
      // Create new conversation
      const conversationRef = doc(collection(db, 'conversations'));
      await setDoc(conversationRef, {
        participants: [user.uid, match.userId],
        participantNames: {
          [user.uid]: user.displayName || 'You',
          [match.userId]: match.displayName || 'User'
        },
        participantPhotos: {
          [user.uid]: userProfile.profilePic || '',
          [match.userId]: match.profilePic || ''
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
      });
      
      // Move match to chattingWith array when creating a new conversation
      moveToChattingWith(match.userId);
      
      setSelectedConversation(conversations.find(c => c.id === conversationRef.id) || null);
      setIsLoading(false);
    } catch (error) {
      console.error('Error creating conversation:', error);
      setIsLoading(false);
    }
  };
  
  const sendMessage = async () => {
    if (!selectedConversation || !user || !newMessage.trim()) return;
    
    try {
      const conversationRef = doc(db, 'conversations', selectedConversation.id);
      const conversationDoc = await getDoc(conversationRef);
      
      if (!conversationDoc.exists()) return;
      
      const conversationData = conversationDoc.data();
      const otherParticipant = conversationData.participants.find((p: string) => p !== user.uid);
      
      // Add message to conversation
      const messagesRef = collection(db, `conversations/${selectedConversation.id}/messages`);
      const messageDoc = doc(messagesRef);
      await setDoc(messageDoc, {
        senderId: user.uid,
        senderName: conversationData.participantNames[user.uid],
        text: newMessage.trim(),
        timestamp: Timestamp.now(),
        read: false
      });
      
      // Update conversation with last message
      await updateDoc(conversationRef, {
        lastMessage: {
          text: newMessage.trim(),
          timestamp: Timestamp.now()
        },
        lastMessageTimestamp: Timestamp.now(),
        [`unreadCount.${otherParticipant}`]: (conversationData.unreadCount?.[otherParticipant] || 0) + 1
      });
      
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };
  
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
  
  // Function to truncate long messages
  const truncateText = (text: string, maxLength: number = 30): string => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };
  
  const renderConversationItem = ({ item }: { item: Conversation }) => {
    // Get the other participant
    const otherParticipantId = item.participants.find(p => p !== user?.uid) || '';
    const otherParticipantName = item.participantNames?.[otherParticipantId] || 'User';
    const otherParticipantPhoto = item.participantPhotos?.[otherParticipantId] || '';
    
    // Get the last message text and time
    const lastMessageText = typeof item.lastMessage?.text === 'string' 
      ? truncateText(item.lastMessage.text) 
      : 'No messages yet';
    
 
      
    // Check if this is a new match (less than 24h old)
    // Look in both matches and chattingWith arrays
    const matchData = matches.find(m => m.userId === otherParticipantId) || 
                     chattingWith.find(c => c.userId === otherParticipantId);
    const shouldBlurImage = matchData && isNewMatch(matchData.matchTimestamp);
    
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
              style={styles.avatar} 
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
  
  const renderMatchItem = ({ item }: { item: MatchData }) => {
    const shouldBlur = isNewMatch(item.matchTimestamp);

    return (
      <TouchableOpacity
        style={styles.matchItem}
        onPress={() => createConversation(item)}
      >
        <View style={styles.matchAvatarContainer}>
          {shouldBlur ? (
            <View style={styles.blurContainer}>
              <Image
                source={{ uri: item.profilePic || 'https://via.placeholder.com/60' }}
                style={styles.matchAvatar}
                blurRadius={30}
              />
              
            </View>
          ) : (
            <Image
              source={{ uri: item.profilePic || 'https://via.placeholder.com/60' }}
              style={styles.matchAvatar}
            />
          )}
        </View>
        <Text style={styles.matchName}>{item.displayName}</Text>
      </TouchableOpacity>
    );
  };
  
  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.senderId === user?.uid;
    
    // Ensure we're only rendering string text
    const messageText = typeof item.text === 'string' ? truncateText(item.text, 300) : 'Message unavailable';
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
  
  const renderEmptyInbox = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubble-ellipses-outline" size={80} color={COLORS.secondary} />
      <Text style={styles.emptyTitle}>No Messages Yet</Text>
      <Text style={styles.emptyText}>
        Start a conversation with your matches by clicking on their profile in the matches row above!
      </Text>
    </View>
  );
  
  const getOtherParticipantId = (conversation: Conversation): string => {
    if (!user) return '';
    return conversation.participants.find(id => id !== user.uid) || '';
  };
  
  const renderChatHeader = () => {
    if (!selectedConversation) return null;
    
    const otherParticipantId = getOtherParticipantId(selectedConversation);
    
    return (
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => setSelectedConversation(null)}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        
        <Image 
          source={{ uri: selectedConversation.participantPhotos[otherParticipantId] || 'https://via.placeholder.com/40' }} 
          style={styles.chatAvatar} 
        />
        
        <Text style={styles.chatName}>{selectedConversation.participantNames[otherParticipantId]}</Text>
      </View>
    );
  };
  
  const renderChatInterface = () => {
    return (
      <View style={styles.chatContainer}>
        {renderChatHeader()}
        
        {/* Messages */}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id || item.text}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesContainer}
          inverted={false}
        />
        
        {/* Message input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <TouchableOpacity 
            style={[
              styles.sendButton,
              !newMessage.trim() && styles.disabledSendButton
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim()}
          >
            <Ionicons name="send" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
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
  
  // Handle unblocking a user
  const handleUnblockUser = async (userId: string) => {
    if (!userId) return;
    
    Alert.alert(
      "Unblock User",
      "Are you sure you want to unblock this user? They may appear in your matches again.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Unblock", 
          onPress: async () => {
            try {
              setUnblockingUserId(userId);
              setIsUnblocking(true);
              await unblockUser(userId);
              setUnblockingUserId(null);
            } catch (error) {
              console.error('Error unblocking user:', error);
              Alert.alert('Error', 'Failed to unblock user. Please try again.');
            } finally {
              setIsUnblocking(false);
            }
          }
        }
      ]
    );
  };

  // Render a blocked user item
  const renderBlockedUserItem = ({ item }: { item: MatchData }) => {
    const isBeingUnblocked = isUnblocking && unblockingUserId === item.userId;
    
    return (
      <View style={styles.blockedUserItem}>
        <Image 
          source={{ uri: item.profilePic || 'https://via.placeholder.com/40' }}
          style={styles.blockedUserAvatar}
        />
        <Text style={styles.blockedUserName}>{item.displayName}</Text>
        <TouchableOpacity
          style={[styles.unblockButton, isBeingUnblocked && styles.disabledButton]}
          onPress={() => handleUnblockUser(item.userId)}
          disabled={isBeingUnblocked}
        >
          {isBeingUnblocked ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.unblockButtonText}>Unblock</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // Render the blocked users modal
  const renderBlockedUsersModal = () => {
    return (
      <Modal
        visible={showBlockedUsers}
        animationType="slide"
        onRequestClose={() => setShowBlockedUsers(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowBlockedUsers(false)}
            >
              <Ionicons name="close" size={24} color={COLORS.secondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Blocked Users</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>
          
          {blockedUsers.length === 0 ? (
            <View style={styles.emptyBlockedContainer}>
              <Ionicons name="ban" size={60} color="#ccc" />
              <Text style={styles.emptyBlockedText}>No blocked users</Text>
            </View>
          ) : (
            <FlatList
              data={blockedUsers}
              keyExtractor={item => item.userId}
              renderItem={renderBlockedUserItem}
              contentContainerStyle={styles.blockedUsersList}
            />
          )}
        </SafeAreaView>
      </Modal>
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
          style={styles.optionsOverlay}
          activeOpacity={1}
          onPress={() => setShowOptionsMenu(false)}
        >
          <View style={styles.optionsContainer}>
            <TouchableOpacity 
              style={styles.optionItem}
              onPress={() => {
                setShowOptionsMenu(false);
                setShowBlockedUsers(true);
              }}
            >
              <Ionicons name="ban" size={24} color={COLORS.secondary} style={styles.optionIcon} />
              <Text style={styles.optionText}>Blocked Users</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };
  
  // Add a cleanup effect separate from the loadConversations effect
  useEffect(() => {
    // This effect is just for cleanup when component unmounts
    return () => {
      if (unsubscribeListener) {
        unsubscribeListener();
      }
    };
  }, [unsubscribeListener]);

  // Add logout listener in another useEffect
  useEffect(() => {
    const handleLogout = () => {
      // Clean up any Firebase listeners when user logs out
      if (unsubscribeListener) {
        unsubscribeListener();
        setUnsubscribeListener(null);
      }
      // Also clear conversations data
      setConversations([]);
    };

    // Listen for logout events
    logoutEventEmitter.addListener(LOGOUT_EVENT, handleLogout);

    // Clean up
    return () => {
      logoutEventEmitter.removeListener(LOGOUT_EVENT, handleLogout);
    };
  }, [unsubscribeListener, setConversations]);
  
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Blocked Users Modal */}
      {renderBlockedUsersModal()}
      
      {/* Options Menu */}
      {renderOptionsMenu()}
      
      {/* Warning message if needed */}
      {indexWarning && renderWarningMessage()}
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Inbox</Text>
        <TouchableOpacity 
          style={styles.optionsButton}
          onPress={() => setShowOptionsMenu(true)}
        >
          <Ionicons name="ellipsis-vertical" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
      </View>
      
      {/* Your Matches Section */}
      <Text style={styles.sectionTitle}>Your Matches</Text>
      <View style={styles.matchesContainer}>
        <FlatList
          horizontal
          data={matches}
          keyExtractor={(item) => item.userId}
          renderItem={renderMatchItem}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.matchesList}
          ListEmptyComponent={
            <View style={styles.emptyMatchesContainer}>
              <Text style={styles.emptyText}>No matches yet</Text>
            </View>
          }
        />
      </View>
      
      {/* Rest of the component */}
      {selectedConversation ? (
        renderChatInterface()
      ) : (
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
      )}
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
  matchAvatarContainer: {
    position: 'relative',
  },
  blurContainer: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
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
  selectedConversation: {
    backgroundColor: '#f0f0f5',
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
  timeText: {
    fontSize: 12,
    color: '#888',
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
  chatContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 15,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  backButton: {
    padding: 5,
  },
  chatAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: 10,
  },
  chatName: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
    color: '#333',
  },
  messagesContainer: {
    padding: 15,
    paddingBottom: 20,
  },
  messageContainer: {
    marginBottom: 15,
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
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
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
 
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  optionsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  optionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginTop: 60,
    marginRight: 20,
    width: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  optionIcon: {
    marginRight: 10,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.secondary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  modalHeaderSpacer: {
    width: 40,
  },
  blockedUsersList: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  blockedUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  blockedUserAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
  },
  blockedUserName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  unblockButton: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  unblockButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.6,
  },
  emptyBlockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBlockedText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
  },
  matchesList: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  emptyMatchesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});