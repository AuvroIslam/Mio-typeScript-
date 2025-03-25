import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  Image,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
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
  setDoc, 
  Timestamp,
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

export default function ChatScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const conversationId = params.conversationId as string;
  const matchId = params.matchId as string; // User ID we want to chat with (from profile)
  const fromInbox = params.fromInbox as string;
  
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [otherUser, setOtherUser] = useState<{id: string, name: string, photo: string}>({
    id: '',
    name: 'User',
    photo: ''
  });
  
  // Initialize or load existing conversation
  useEffect(() => {
    if (!user) return;
    
    const initializeChat = async () => {
      setIsLoading(true);
      
      try {
        // If we have a conversation ID, just load that conversation
        if (conversationId) {
          loadExistingConversation(conversationId);
          return;
        }
        
        // If we have a matchId, check if a conversation exists or create a new one
        if (matchId) {
          const existingConversationId = await findOrCreateConversation(matchId);
          if (existingConversationId) {
            loadExistingConversation(existingConversationId);
          }
        }
      } catch (error) {
        console.error('Error initializing chat:', error);
      }
    };
    
    initializeChat();
  }, [user, conversationId, matchId]);
  
  // Find existing conversation or create a new one
  const findOrCreateConversation = async (otherUserId: string) => {
    if (!user) return null;
    
    try {
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
        if (data.participants && data.participants.includes(otherUserId)) {
          existingConversationId = docSnapshot.id;
        }
      });
      
      if (existingConversationId) {
        return existingConversationId;
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
      
      // Create new conversation
      const newConversationRef = doc(collection(db, 'conversations'));
      await setDoc(newConversationRef, {
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
          timestamp: Timestamp.now()
        },
        lastMessageTimestamp: Timestamp.now(),
        createdAt: Timestamp.now(),
        unreadCount: {
          [user.uid]: 0,
          [otherUserId]: 0
        }
      });
      
      return newConversationRef.id;
    } catch (error) {
      console.error('Error finding or creating conversation:', error);
      return null;
    }
  };
  
  // Load an existing conversation
  const loadExistingConversation = (id: string) => {
    if (!user) return;
    
    // Listen for conversation updates
    const unsubscribeConversation = onSnapshot(doc(db, 'conversations', id), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const conversationData = docSnapshot.data() as Conversation;
        conversationData.id = docSnapshot.id;
        setConversation(conversationData);
        
        // Set other user's information
        const otherParticipantId = conversationData.participants.find(p => p !== user.uid) || '';
        setOtherUser({
          id: otherParticipantId,
          name: conversationData.participantNames[otherParticipantId] || 'User',
          photo: conversationData.participantPhotos[otherParticipantId] || ''
        });
      }
      
      setIsLoading(false);
    });
    
    // Listen for messages
    const messagesRef = collection(db, `conversations/${id}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const messageList: Message[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        messageList.push({
          id: doc.id,
          text: data.text,
          senderId: data.senderId,
          senderName: data.senderName || '',
          timestamp: data.timestamp,
          read: data.read
        });
      });
      
      setMessages(messageList);
      
      // Mark messages as read
      markMessagesAsRead(id);
    });
    
    return () => {
      unsubscribeConversation();
      unsubscribeMessages();
    };
  };
  
  // Mark messages as read
  const markMessagesAsRead = async (convId: string) => {
    if (!user) return;
    
    try {
      // Update unread count to 0 for current user
      await updateDoc(doc(db, 'conversations', convId), {
        [`unreadCount.${user.uid}`]: 0
      });
      
      // Mark all messages as read
      const messagesRef = collection(db, `conversations/${convId}/messages`);
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
  
  // Send a message
  const sendMessage = async () => {
    if (!user || !conversation || !messageText.trim()) return;
    
    try {
      // Get the other participant
      const otherParticipant = conversation.participants.find(p => p !== user.uid) || '';
      
      // Add message to conversation
      const messagesRef = collection(db, `conversations/${conversation.id}/messages`);
      const messageDoc = doc(messagesRef);
      await setDoc(messageDoc, {
        senderId: user.uid,
        senderName: conversation.participantNames[user.uid],
        text: messageText.trim(),
        timestamp: Timestamp.now(),
        read: false
      });
      
      // Update conversation with last message
      await updateDoc(doc(db, 'conversations', conversation.id), {
        lastMessage: {
          text: messageText.trim(),
          timestamp: Timestamp.now()
        },
        lastMessageTimestamp: Timestamp.now(),
        [`unreadCount.${otherParticipant}`]: (conversation.unreadCount?.[otherParticipant] || 0) + 1
      });
      
      setMessageText('');
    } catch (error) {
      console.error('Error sending message:', error);
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
  
  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Chat header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => {
            // Navigate based on where the user came from
            if (fromInbox === 'true') {
              router.replace('/(tabs)/inbox');
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => {
            if (otherUser.id) {
              router.push({
                pathname: '/(common)/userProfile',
                params: { userId: otherUser.id }
              });
            }
          }}
        >
          <Image 
            source={{ uri: otherUser.photo || 'https://via.placeholder.com/40' }} 
            style={styles.avatar} 
          />
          <Text style={styles.userName}>{otherUser.name}</Text>
        </TouchableOpacity>
      </View>
      
      {/* Messages */}
      <KeyboardAvoidingView 
        style={styles.chatContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id || item.timestamp.toString()}
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
    backgroundColor: COLORS.secondary,
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
  avatar: {
    width: 40,
    height: 40,
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
}); 