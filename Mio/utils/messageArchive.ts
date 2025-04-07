import { db, storage } from '../config/firebaseConfig';
import { 
  doc, 
  getDoc,
  Timestamp
} from 'firebase/firestore';
import { 
  ref, 
  getBytes
} from 'firebase/storage';

// Configuration constants (must match Cloud Functions)
export const MESSAGE_BATCH_SIZE = 20; // Number of messages per batch
export const BATCHES_TO_KEEP = 3; // Keep this many recent batches in Firestore
export const ARCHIVE_THRESHOLD = BATCHES_TO_KEEP * MESSAGE_BATCH_SIZE; // When to archive (after this many messages)

// Interface for message batch
export interface MessageBatch {
  id?: string;
  messages: any[]; // Messages can have raw timestamps initially
  startTime: Timestamp;
  endTime: Timestamp;
}

// Interface for archived message metadata
export interface ArchiveMetadata {
  path: string;
  count: number;
  oldestTimestamp: Timestamp;
  newestTimestamp: Timestamp;
  createdAt: Date;
}

/**
 * Retrieve archived messages from Firebase Storage
 * @param archivePath The path to the archived messages in Storage
 * @returns Promise with the archived messages or error
 */
export const fetchArchivedMessages = async (archivePath: string): Promise<{
  success: boolean;
  data?: MessageBatch[];
  error?: string;
}> => {
  try {
    // Get the archive file from Storage
    const storageRef = ref(storage, archivePath);
    
    const archiveBytes = await getBytes(storageRef);
    
    // Convert to text and parse JSON
    const archiveText = new TextDecoder().decode(archiveBytes);
    
    const archiveData = JSON.parse(archiveText);
    
    if (!archiveData || !archiveData.batches || !Array.isArray(archiveData.batches)) {
      return {
        success: false,
        error: 'Invalid archive data format'
      };
    }
    
    // Convert raw timestamp objects back to Firebase Timestamps
    const processedBatches = archiveData.batches.map((batch: any) => {
      const processedMessages = batch.messages.map((msg: any) => {
        // Check for the properties used when Firestore Timestamps are stringified
        if (msg.timestamp && typeof msg.timestamp === 'object' && msg.timestamp._seconds !== undefined) {
          return {
            ...msg,
            timestamp: new Timestamp(msg.timestamp._seconds, msg.timestamp._nanoseconds || 0),
          };
        }
        // Log if the timestamp format is unexpected
        if (msg.timestamp) {
          console.warn("Unexpected timestamp format in archive:", JSON.stringify(msg.timestamp));
        }
        return msg; // Return message as-is if timestamp is not in expected format
      });
      
      // Convert batch start/end times as well, checking for _seconds
      const startTime = batch.startTime && typeof batch.startTime === 'object' && batch.startTime._seconds !== undefined
        ? new Timestamp(batch.startTime._seconds, batch.startTime._nanoseconds || 0)
        : batch.startTime; // Fallback
      const endTime = batch.endTime && typeof batch.endTime === 'object' && batch.endTime._seconds !== undefined
        ? new Timestamp(batch.endTime._seconds, batch.endTime._nanoseconds || 0)
        : batch.endTime; // Fallback
        
      return {
        ...batch,
        messages: processedMessages,
        startTime: startTime,
        endTime: endTime
      };
    });
    
    return {
      success: true,
      data: processedBatches
    };
  } catch (error) {
    console.error('Error fetching archived messages:', error);
    return {
      success: false,
      error: `Failed to fetch archived messages: ${error}`
    };
  }
};

/**
 * Get archived message batches for a conversation from Firebase Storage
 * @param conversationId The conversation ID
 * @param olderThan Optional timestamp to get archives older than this date
 * @returns Promise with archive metadata or error
 */
export const getArchiveMetadata = async (conversationId: string, olderThan?: Timestamp): Promise<{
  success: boolean;
  archives?: ArchiveMetadata[];
  error?: string;
}> => {
  try {
    // Get conversation document to find archives
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationDoc = await getDoc(conversationRef);
    
    if (!conversationDoc.exists()) {
      return {
        success: false,
        error: 'Conversation not found'
      };
    }
    
    const conversationData = conversationDoc.data();
    
    if (!conversationData.archives || !Array.isArray(conversationData.archives)) {
      return {
        success: true,
        archives: []
      };
    }
    
    let archives = conversationData.archives as ArchiveMetadata[];
    
    // Convert raw timestamp objects in metadata back to Firebase Timestamps
    // Metadata timestamps are directly from Firestore, so they use .seconds
    archives = archives.map((archive) => {
      const oldestTimestampObj = archive.oldestTimestamp as any;
      const newestTimestampObj = archive.newestTimestamp as any;
      
      const oldestTimestamp = oldestTimestampObj && typeof oldestTimestampObj === 'object' && oldestTimestampObj.seconds !== undefined
        ? new Timestamp(oldestTimestampObj.seconds, oldestTimestampObj.nanoseconds)
        : archive.oldestTimestamp; // Fallback
      const newestTimestamp = newestTimestampObj && typeof newestTimestampObj === 'object' && newestTimestampObj.seconds !== undefined
        ? new Timestamp(newestTimestampObj.seconds, newestTimestampObj.nanoseconds)
        : archive.newestTimestamp; // Fallback
        
      return {
        ...archive,
        oldestTimestamp: oldestTimestamp,
        newestTimestamp: newestTimestamp,
      };
    });
    
    // Filter archives by date if requested
    if (olderThan) {
      archives = archives.filter((archive) => {
        // Ensure we compare valid Timestamp objects
        return archive.newestTimestamp instanceof Timestamp && olderThan instanceof Timestamp && 
               archive.newestTimestamp.toMillis() < olderThan.toMillis();
      });
    }
    
    // Sort archives by newest timestamp (most recent first)
    archives.sort((a, b) => {
      // Ensure we compare valid Timestamp objects
      if (a.newestTimestamp instanceof Timestamp && b.newestTimestamp instanceof Timestamp) {
        return b.newestTimestamp.toMillis() - a.newestTimestamp.toMillis();
      }
      return 0; // Default sort order if timestamps are invalid
    });
    
    return {
      success: true,
      archives
    };
  } catch (error) {
    console.error('Error getting archive metadata:', error);
    return {
      success: false,
      error: `Failed to get archive metadata: ${error}`
    };
  }
}; 