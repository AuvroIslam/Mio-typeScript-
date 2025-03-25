import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  SafeAreaView,
  TextInput
} from 'react-native';
import { router, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
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
  setDoc,
  getDocs
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
  // Add other properties as needed
}

export default function InboxScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialMatchId = params.matchId as string;
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [otherUserName, setOtherUserName] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [indexWarning, setIndexWarning] = useState(false);
  
  // Load user's matches and conversations
  useEffect(() => {
    if (!user) return;
    
    setIsLoading(true);
    
    // Get user's matches
    const fetchMatches = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().matches) {
          setMatches(userDoc.data().matches || []);
        }
      } catch (error) {
        console.error('Error fetching matches:', error);
      }
    };
    
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
            // Log data for debugging
            console.log(`Processing conversation ${docSnapshot.id}`);
            
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
        
        console.log(`Loaded ${conversationList.length} conversations`);
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
    
    fetchMatches();
    
    // Cleanup function
    return () => unsubscribe();
  }, [user]);
  
  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConversation || !user) return;
    
    const messagesRef = collection(db, `conversations/${selectedConversation}/messages`);
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
      await updateDoc(doc(db, 'conversations', selectedConversation), {
        [`unreadCount.${user.uid}`]: 0
      });
      
      // Mark all messages as read
      const messagesRef = collection(db, `conversations/${selectedConversation}/messages`);
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
      
      if (existingConversationId) {
        setSelectedConversation(existingConversationId);
        return;
      }
      
      // Get current user's profile data
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userProfile = userDoc.data()?.profile || {};
      
      // Create new conversation
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
      });
      
      setSelectedConversation(newConversationRef.id);
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };
  
  const sendMessage = async () => {
    if (!selectedConversation || !user || !messageText.trim()) return;
    
    try {
      const conversationRef = doc(db, 'conversations', selectedConversation);
      const conversationDoc = await getDoc(conversationRef);
      
      if (!conversationDoc.exists()) return;
      
      const conversationData = conversationDoc.data();
      const otherParticipant = conversationData.participants.find((p: string) => p !== user.uid);
      
      // Add message to conversation
      const messagesRef = collection(db, `conversations/${selectedConversation}/messages`);
      const messageDoc = doc(messagesRef);
      await setDoc(messageDoc, {
        senderId: user.uid,
        senderName: conversationData.participantNames[user.uid],
        text: messageText.trim(),
        timestamp: Timestamp.now(),
        read: false
      });
      
      // Update conversation with last message
      await updateDoc(conversationRef, {
        lastMessage: {
          text: messageText.trim(),
          timestamp: Timestamp.now()
        },
        lastMessageTimestamp: Timestamp.now(),
        [`unreadCount.${otherParticipant}`]: (conversationData.unreadCount?.[otherParticipant] || 0) + 1
      });
      
      setMessageText('');
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
  
  const renderConversationItem = ({ item }: { item: Conversation }) => {
    // Get the other participant
    const otherParticipantId = item.participants.find(p => p !== user?.uid) || '';
    const otherParticipantName = item.participantNames?.[otherParticipantId] || 'User';
    const otherParticipantPhoto = item.participantPhotos?.[otherParticipantId] || '';
    
    // Get the last message text and time
    const lastMessageText = typeof item.lastMessage?.text === 'string' 
      ? item.lastMessage.text 
      : 'No messages yet';
    
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
        <Image 
          source={{ uri: otherParticipantPhoto || 'https://via.placeholder.com/60' }} 
          style={styles.avatar} 
        />
        
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={styles.userName}>{otherParticipantName}</Text>
            <Text style={styles.timeText}>{lastMessageText}</Text>
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
    return (
      <TouchableOpacity 
        style={styles.matchItem}
        onPress={() => {
          router.push({
            pathname: '/(conversations)/chat',
            params: { 
              matchId: item.userId,
              fromInbox: 'true'
            }
          });
        }}
      >
        <Image 
          source={{ uri: item.profilePic || 'https://via.placeholder.com/60' }} 
          style={styles.matchAvatar} 
        />
        <Text style={styles.matchName} numberOfLines={1}>
          {item.displayName}
        </Text>
      </TouchableOpacity>
    );
  };
  
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
    
    const selectedChat = conversations.find(c => c.id === selectedConversation);
    if (!selectedChat) return null;
    
    const otherParticipantId = getOtherParticipantId(selectedChat);
    
    return (
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => setSelectedConversation(null)}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        
        <Image 
          source={{ uri: selectedChat.participantPhotos[otherParticipantId] || 'https://via.placeholder.com/40' }} 
          style={styles.chatAvatar} 
        />
        
        <Text style={styles.chatName}>{selectedChat.participantNames[otherParticipantId]}</Text>
      </View>
    );
  };
  
  const renderChatInterface = () => {
    const selectedChat = conversations.find(c => c.id === selectedConversation);
    
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
      </View>
    );
  };
  
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
      console.log(`Migrated conversation ${conversationId} to new format`);
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
  
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inbox</Text>
      </View>
      
      {indexWarning && renderWarningMessage()}
      
      {/* Matches row */}
      <View>
        <Text style={styles.sectionTitle}>Your Matches</Text>
        <FlatList
          data={matches}
          keyExtractor={(item) => item.userId}
          renderItem={renderMatchItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.matchesContainer}
          ListEmptyComponent={
            <Text style={styles.noMatchesText}>No matches yet. Try searching for more!</Text>
          }
        />
      </View>
      
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
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
    color: '#333',
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
});