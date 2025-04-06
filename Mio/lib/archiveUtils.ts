import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc, increment, arrayUnion, collection, query, orderBy, limit, getDocs, writeBatch, Timestamp } from 'firebase/firestore';
import { db, storage } from '../config/firebaseConfig';
import { ref, getBytes } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions } from 'firebase/functions';

// Constants
const ARCHIVE_CACHE_PREFIX = 'archive_cache_';
const ARCHIVE_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Helper function for consistently handling timestamps
const convertToTimestamp = (timestampData: any): any => {
  try {
    // Case 1: Already a valid Timestamp with seconds and nanoseconds
    if (timestampData && typeof timestampData === 'object') {
      // Regular Firestore Timestamp
      if (timestampData.seconds !== undefined && timestampData.nanoseconds !== undefined) {
        return new Timestamp(
          Number(timestampData.seconds),
          Number(timestampData.nanoseconds)
        );
      }
      
      // Firebase Admin timestamp or cached version
      if (timestampData._seconds !== undefined && timestampData._nanoseconds !== undefined) {
        return new Timestamp(
          Number(timestampData._seconds),
          Number(timestampData._nanoseconds)
        );
      }
      
      // Date object
      if (timestampData instanceof Date) {
        return Timestamp.fromDate(timestampData);
      }
      
      // Object with toDate method
      if (typeof timestampData.toDate === 'function') {
        const date = timestampData.toDate();
        return Timestamp.fromDate(date);
      }
    }
    
    // Case 2: String timestamp
    if (typeof timestampData === 'string') {
      return Timestamp.fromDate(new Date(timestampData));
    }
    
    // Case 3: Numeric timestamp (milliseconds)
    if (typeof timestampData === 'number') {
      return Timestamp.fromDate(new Date(timestampData));
    }
  } catch (error) {
    console.error('Error converting timestamp:', error);
  }
  
  // Default - current timestamp
  return Timestamp.now();
};

/**
 * Load archived messages from Firebase Storage with caching
 * @param conversationId - The ID of the conversation
 * @param archivePath - The path to the archive in Firebase Storage
 * @returns An array of messages from the archive
 */
export const loadArchivedMessages = async (conversationId: string, archivePath: string) => {
  if (!conversationId || !archivePath) {
    console.error('Missing required parameters for loadArchivedMessages');
    return [];
  }

  console.log(`archiveUtils: Loading messages from ${archivePath}`);
  
  // Create a cache key based on the conversation ID and archive path
  const cacheKey = `${ARCHIVE_CACHE_PREFIX}${conversationId}_${archivePath.replace(/\//g, '_')}`;
  
  try {
    // Check if we have a cached version
    const cachedData = await AsyncStorage.getItem(cacheKey);
    
    if (cachedData) {
      console.log(`archiveUtils: Found cached archive data for ${archivePath}`);
      const parsedData = JSON.parse(cachedData);
      
      // Process the cached data to convert date strings back to Firestore Timestamps
      const processedMessages = parsedData.map((message: any) => {
        try {
          // Process timestamp - use our helper function
          message.timestamp = convertToTimestamp(message.timestamp);
          
          // Ensure each message has an ID
          if (!message.id) {
            message.id = `archived_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          }
          
          return message;
        } catch (error) {
          console.error('Error processing cached message:', error, message);
          return message; // Return original message if processing fails
        }
      });
      
      console.log(`archiveUtils: Returning ${processedMessages.length} cached archived messages`);
      return processedMessages;
    }
    
    // No cache, load from Firebase Storage
    console.log(`archiveUtils: No cache found, loading from Firebase Storage: ${archivePath}`);
    
    // Normalize the path to ensure it's valid
    const normalizedPath = archivePath.startsWith('/') ? archivePath.substring(1) : archivePath;
    console.log(`archiveUtils: Normalized path: ${normalizedPath}`);
    
    // Get a reference to the file in Firebase Storage
    const archiveRef = ref(storage, normalizedPath);
    console.log(`archiveUtils: Created storage reference for: ${archiveRef.fullPath}`);
    
    let archiveBytes;
    try {
      // Attempt to get the bytes from storage
      console.log(`archiveUtils: Attempting to download archive...`);
      archiveBytes = await getBytes(archiveRef);
      console.log(`archiveUtils: Successfully downloaded ${archiveBytes.length} bytes`);
    } catch (storageError: any) {
      console.error(`archiveUtils: Storage error: ${storageError.code} - ${storageError.message}`);
      
      // For object-not-found errors, we just return an empty array
      if (storageError.code === 'storage/object-not-found') {
        console.log(`archiveUtils: Archive file not found in storage: ${normalizedPath}`);
        return [];
      }
      
      // For other errors, we throw to be caught by the outer try/catch
      throw storageError;
    }
    
    let archiveData = [];
    try {
      // Convert bytes to string and parse JSON
      const decoder = new TextDecoder('utf-8');
      const archiveJson = decoder.decode(archiveBytes);
      console.log(`archiveUtils: Successfully decoded bytes to JSON string (length: ${archiveJson.length})`);
      
      // Parse the JSON - this is where many errors can happen
      try {
        archiveData = JSON.parse(archiveJson);
        console.log(`archiveUtils: Successfully parsed JSON data, contains ${archiveData.length} messages`);
        
        // Log the structure of the first message to help with debugging
        if (archiveData.length > 0) {
          console.log(`archiveUtils: First message structure: ${JSON.stringify(archiveData[0])}`);
        }
      } catch (jsonError) {
        console.error(`archiveUtils: Failed to parse JSON: ${jsonError}`);
        console.log(`archiveUtils: First 100 chars of JSON: ${archiveJson.substring(0, 100)}...`);
        return []; // Return empty array on JSON parse error
      }
    } catch (decodeError) {
      console.error(`archiveUtils: Failed to decode bytes: ${decodeError}`);
      return []; // Return empty array on decode error
    }
    
    if (!Array.isArray(archiveData) || archiveData.length === 0) {
      console.log(`archiveUtils: No messages found in archive or invalid data structure`);
      return []; // Return empty array if no messages or invalid structure
    }
    
    // Process the data to ensure all timestamps are Firestore Timestamps
    const processedMessages = archiveData.map((message: any, index: number) => {
      try {
        // Process timestamp - use our helper function
        const originalTimestamp = message.timestamp;
        message.timestamp = convertToTimestamp(message.timestamp);
        
        // Ensure each message has an ID
        if (!message.id) {
          message.id = `archived_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        return message;
      } catch (error) {
        console.error(`archiveUtils: Error processing message at index ${index}:`, error);
        console.log(`archiveUtils: Problematic message:`, JSON.stringify(message));
        
        // Create a valid message with current timestamp if processing fails
        return {
          ...message,
          id: message.id || `archived_error_${Date.now()}_${index}`,
          timestamp: Timestamp.now(),
          text: message.text || '[Error: Could not process message]'
        };
      }
    });
    
    console.log(`archiveUtils: Successfully processed ${processedMessages.length} archived messages`);
    
    // Cache the processed data for future use
    try {
      // Store simplified timestamp representation for caching
      const cacheableMessages = processedMessages.map((msg: any) => ({
        ...msg,
        timestamp: msg.timestamp ? {
          _seconds: msg.timestamp.seconds,
          _nanoseconds: msg.timestamp.nanoseconds
        } : null
      }));
      
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheableMessages));
      console.log(`archiveUtils: Cached ${processedMessages.length} archived messages`);
    } catch (cacheError) {
      console.warn('Failed to cache archived messages:', cacheError);
      // Continue even if caching fails
    }
    
    console.log(`archiveUtils: Returning ${processedMessages.length} newly loaded archived messages`);
    return processedMessages;
  } catch (error) {
    console.error('Error loading archived messages:', error);
    return []; // Return empty array if there's an error
  }
};

/**
 * Clear the archive cache for a conversation
 * @param conversationId - The ID of the conversation
 */
export const clearArchiveCache = async (conversationId: string) => {
  if (!conversationId) return;
  
  try {
    // Get all keys from AsyncStorage
    const keys = await AsyncStorage.getAllKeys();
    
    // Filter keys that match the conversation's archive cache
    const cacheKeys = keys.filter(key => 
      key.startsWith(`${ARCHIVE_CACHE_PREFIX}${conversationId}_`)
    );
    
    // Remove all matching keys
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
      console.log(`Cleared ${cacheKeys.length} cached archives for conversation ${conversationId}`);
    }
  } catch (error) {
    console.error('Error clearing archive cache:', error);
  }
};

/**
 * Manually trigger archiving for a conversation
 * @param conversationId - The ID of the conversation
 * @returns Result of the manual archive operation
 */
export const triggerManualArchive = async (conversationId: string, functions: any) => {
  if (!conversationId) {
    throw new Error('Conversation ID is required for manual archiving');
  }
  
  try {
    console.log(`Triggering manual archive for conversation ${conversationId}`);
    const manualArchive = httpsCallable(functions, 'manualArchive');
    const result = await manualArchive({ conversationId });
    return result.data;
  } catch (error) {
    console.error('Error triggering manual archive:', error);
    throw error;
  }
}; 