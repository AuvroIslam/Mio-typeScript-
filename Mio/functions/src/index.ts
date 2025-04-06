import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();
const bucket = storage.bucket();

// Message interface to fix type errors
interface Message {
  id: string;
  timestamp: admin.firestore.Timestamp;
  [key: string]: any; // For other message properties
}

// Configuration
const ARCHIVE_THRESHOLD = 20; // Archive when conversation has more than 50 messages
const KEEP_RECENT = 10; // Keep 20 most recent messages in Firestore

/**
 * Scheduled function that runs daily to archive old messages from conversations
 * with more than ARCHIVE_THRESHOLD messages.
 */
export const archiveOldMessages = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    try {
      const conversationsRef = db.collection('conversations');
      const conversations = await conversationsRef.get();

      for (const conversationDoc of conversations.docs) {
        const conversationId = conversationDoc.id;
        const messagesRef = db.collection(`conversations/${conversationId}/messages`);
        
        // Check message count
        const countSnapshot = await messagesRef
          .count()
          .get();
        
        const messageCount = countSnapshot.data().count;
        
        // Only archive if message count exceeds threshold
        if (messageCount > ARCHIVE_THRESHOLD) {
          console.log(`Archiving messages for conversation: ${conversationId} (${messageCount} messages)`);
          
          // Get messages sorted by timestamp (oldest first)
          const messagesToArchive = await messagesRef
            .orderBy('timestamp', 'asc')
            .limit(messageCount - KEEP_RECENT)
            .get();
          
          if (messagesToArchive.empty) {
            console.log('No messages to archive');
            continue;
          }
          
          // Create batch of messages to archive
          const archiveData = messagesToArchive.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Message[];
          
          // Generate a timestamp for the archive file
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const archivePath = `archives/${conversationId}/${timestamp}.json`;
          
          // Upload to Storage
          const file = bucket.file(archivePath);
          await file.save(JSON.stringify(archiveData), {
            contentType: 'application/json',
            metadata: {
              conversationId,
              messageCount: archiveData.length,
              oldestMessageTime: archiveData[0].timestamp,
              newestMessageTime: archiveData[archiveData.length - 1].timestamp
            }
          });
          
          // Update conversation document with archive information
          await conversationDoc.ref.update({
            archivedMessages: admin.firestore.FieldValue.increment(archiveData.length),
            archives: admin.firestore.FieldValue.arrayUnion({
              path: archivePath,
              count: archiveData.length,
              oldestTimestamp: archiveData[0].timestamp,
              newestTimestamp: archiveData[archiveData.length - 1].timestamp,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            })
          });
          
          // Delete archived messages from Firestore
          const batch = db.batch();
          messagesToArchive.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          
          console.log(`Archived ${archiveData.length} messages for conversation ${conversationId}`);
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in archiveOldMessages:', error);
      return null;
    }
  });

/**
 * HTTP function to manually trigger archiving for a specific conversation
 */
export const manualArchive = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }
  
  try {
    const { conversationId } = data;
    
    if (!conversationId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'The function must be called with a conversationId.'
      );
    }
    
    const conversationRef = db.doc(`conversations/${conversationId}`);
    const conversationDoc = await conversationRef.get();
    
    if (!conversationDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'The specified conversation does not exist.'
      );
    }
    
    // Check if user is a participant in the conversation
    const conversationData = conversationDoc.data();
    if (!conversationData?.participants.includes(context.auth.uid)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You do not have permission to archive this conversation.'
      );
    }
    
    // NEW: Get the messageCount from the conversation document
    const messageCount = conversationData.messageCount || 0;
    console.log(`Total messages in conversation (from conversation doc): ${messageCount}`);
    
    // Make sure we have enough messages to archive
    if (messageCount <= KEEP_RECENT) {
      console.log(`Not enough messages to archive. Have ${messageCount}, need more than ${KEEP_RECENT}`);
      return { 
        success: false, 
        message: `Not enough messages to archive. Have ${messageCount}, need more than ${KEEP_RECENT}`
      };
    }
    
    // Get the message batches sorted by time (oldest first)
    const batchesRef = db.collection(`conversations/${conversationId}/messageBatches`);
    const batchesSnapshot = await batchesRef
      .orderBy('startTime', 'asc')
      .get();
    
    console.log(`Found ${batchesSnapshot.size} message batches`);
    
    if (batchesSnapshot.empty) {
      return { 
        success: false, 
        message: 'No message batches found'
      };
    }
    
    // Extract all messages from all batches
    let allMessages: Message[] = [];
    try {
      batchesSnapshot.docs.forEach(batchDoc => {
        const batchData = batchDoc.data();
        console.log(`Processing batch ${batchDoc.id}, messages count: ${batchData.messages?.length || 0}`);
        
        if (batchData.messages && Array.isArray(batchData.messages)) {
          // Add batch ID and position index to each message for reference
          const messagesWithIds = batchData.messages.map((msg: any, index: number) => {
            // Create a deterministic ID if the message doesn't have one
            if (!msg.id) {
              // Use timestamp and index for more reliable tracking
              const timestampStr = msg.timestamp?.toMillis?.() || 
                                  (msg.timestamp?.seconds ? msg.timestamp.seconds * 1000 : Date.now());
              msg.id = `${batchDoc.id}_${timestampStr}_${index}`;
              console.log(`Generated deterministic ID for message: ${msg.id}`);
            }
            return {
              ...msg,
              batchId: batchDoc.id,
              // Add position in the original array
              positionIndex: index
            };
          });
          allMessages = allMessages.concat(messagesWithIds);
        } else {
          console.log(`Batch ${batchDoc.id} has no messages array or invalid format`);
        }
      });
      
      console.log(`Total messages extracted from batches: ${allMessages.length}`);
    } catch (error: any) {
      console.error(`Error extracting messages from batches: ${error}`);
      throw new functions.https.HttpsError(
        'internal',
        `Error extracting messages from batches: ${error.message}`
      );
    }
    
    // Sort all messages by timestamp
    try {
      allMessages.sort((a, b) => {
        // Safe timestamp handling with explicit fallback
        let timeA = 0;
        let timeB = 0;
        
        try {
          if (a.timestamp && typeof a.timestamp.toMillis === 'function') {
            timeA = a.timestamp.toMillis();
          } else if (a.timestamp && typeof a.timestamp === 'object' && a.timestamp.seconds) {
            timeA = a.timestamp.seconds * 1000;
          } else if (typeof a.timestamp === 'number') {
            timeA = a.timestamp;
          }
          
          if (b.timestamp && typeof b.timestamp.toMillis === 'function') {
            timeB = b.timestamp.toMillis();
          } else if (b.timestamp && typeof b.timestamp === 'object' && b.timestamp.seconds) {
            timeB = b.timestamp.seconds * 1000;
          } else if (typeof b.timestamp === 'number') {
            timeB = b.timestamp;
          }
        } catch (sortError) {
          console.error(`Error handling timestamps for sorting: ${sortError}`);
        }
        
        return timeA - timeB;
      });
      
      console.log(`Successfully sorted ${allMessages.length} messages by timestamp`);
    } catch (sortError: any) {
      console.error(`Error sorting messages: ${sortError}`);
      console.error(`First few messages for debugging: ${JSON.stringify(allMessages.slice(0, 3))}`);
      throw new functions.https.HttpsError(
        'internal',
        `Error sorting messages: ${sortError.message}`
      );
    }
    
    // Keep only the oldest messages (leaving the KEEP_RECENT most recent)
    const messagesToArchive = allMessages.slice(0, Math.max(0, allMessages.length - KEEP_RECENT));
    
    console.log(`Messages to archive: ${messagesToArchive.length}`);
    
    if (messagesToArchive.length === 0) {
      return { 
        success: false, 
        message: 'No messages to archive after keeping recent ones'
      };
    }
    
    // Generate a timestamp for the archive file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = `archives/${conversationId}/${timestamp}.json`;
    
    // Upload to Storage
    const file = bucket.file(archivePath);
    await file.save(JSON.stringify(messagesToArchive), {
      contentType: 'application/json',
      metadata: {
        conversationId,
        messageCount: messagesToArchive.length,
        oldestMessageTime: messagesToArchive[0].timestamp,
        newestMessageTime: messagesToArchive[messagesToArchive.length - 1].timestamp
      }
    });
    
    console.log(`Successfully uploaded archive to ${archivePath}`);
    
    // Update conversation document with archive information
    await conversationRef.update({
      archivedMessages: admin.firestore.FieldValue.increment(messagesToArchive.length),
      archives: admin.firestore.FieldValue.arrayUnion({
        path: archivePath,
        count: messagesToArchive.length,
        oldestTimestamp: messagesToArchive[0].timestamp,
        newestTimestamp: messagesToArchive[messagesToArchive.length - 1].timestamp,
        createdAt: new Date() // Using regular Date instead of serverTimestamp
      })
    });
    
    // Define constants and variables for batch operations
    const MAX_BATCH_OPERATIONS = 400; // Firestore limit is 500, use 400 to be safe
    const batch = db.batch();
    let operationCount = 0;

    // IMPROVED APPROACH: Process each batch
    try {
      // Get the most recent messages to keep (these won't be deleted)
      const messagesToKeep = allMessages.slice(Math.max(0, allMessages.length - KEEP_RECENT));
      console.log(`Keeping ${messagesToKeep.length} most recent messages`);
      
      // Create a new batch that will contain only the most recent messages
      if (messagesToKeep.length > 0) {
        // Group messages to keep by batch ID
        const keepMessagesByBatch: { [batchId: string]: any[] } = {};
        messagesToKeep.forEach(msg => {
          const batchId = msg.batchId;
          if (!keepMessagesByBatch[batchId]) {
            keepMessagesByBatch[batchId] = [];
          }
          // Store a clean version without our added tracking fields
          const cleanMsg = {...msg};
          delete cleanMsg.batchId;
          delete cleanMsg.positionIndex;
          keepMessagesByBatch[batchId].push(cleanMsg);
        });
        
        // Delete ALL existing message batches
        for (const batchDoc of batchesSnapshot.docs) {
          console.log(`Deleting batch ${batchDoc.id}`);
          batch.delete(batchDoc.ref);
          operationCount++;
          
          // Commit if we're approaching limits
          if (operationCount >= MAX_BATCH_OPERATIONS) {
            console.log(`Committing intermediate batch with ${operationCount} operations`);
            await batch.commit();
            operationCount = 0;
          }
        }
        
        // Create new batches for the messages to keep
        for (const batchId in keepMessagesByBatch) {
          const messages = keepMessagesByBatch[batchId];
          if (messages.length > 0) {
            console.log(`Creating new batch with ${messages.length} messages to keep`);
            
            // Create a new batch doc with a new ID
            const newBatchRef = db.collection(`conversations/${conversationId}/messageBatches`).doc();
            
            // Get the timestamps for startTime and endTime
            let startTimestamp, endTimestamp;
            try {
              startTimestamp = messages[0].timestamp;
              endTimestamp = messages[messages.length - 1].timestamp;
            } catch (e) {
              console.log(`Error getting timestamps: ${e}`);
              startTimestamp = admin.firestore.Timestamp.now();
              endTimestamp = admin.firestore.Timestamp.now();
            }
            
            batch.set(newBatchRef, {
              messages: messages,
              startTime: startTimestamp,
              endTime: endTimestamp
            });
            operationCount++;
            
            // If this is the newest batch, update the conversation's currentBatchId
            if (batchId === batchesSnapshot.docs[batchesSnapshot.docs.length - 1].id) {
              console.log(`Setting ${newBatchRef.id} as the current batch ID`);
              batch.update(conversationRef, {
                currentBatchId: newBatchRef.id
              });
              operationCount++;
            }
            
            // Commit if we're approaching limits
            if (operationCount >= MAX_BATCH_OPERATIONS) {
              console.log(`Committing intermediate batch with ${operationCount} operations`);
              await batch.commit();
              operationCount = 0;
            }
          }
        }
      } else {
        // If we're keeping no messages, just delete all batches
        for (const batchDoc of batchesSnapshot.docs) {
          console.log(`Deleting batch ${batchDoc.id} (keeping no messages)`);
          batch.delete(batchDoc.ref);
          operationCount++;
          
          // Commit if we're approaching limits
          if (operationCount >= MAX_BATCH_OPERATIONS) {
            console.log(`Committing intermediate batch with ${operationCount} operations`);
            await batch.commit();
            operationCount = 0;
          }
        }
      }
      
      // Update the message count in the conversation
      batch.update(conversationRef, {
        messageCount: KEEP_RECENT  // Set the exact count of messages we're keeping
      });
      operationCount++;
      
      if (operationCount > 0) {
        console.log(`Committing final batch with ${operationCount} operations`);
        await batch.commit();
      }
      
      console.log(`Successfully committed batch updates`);
    } catch (error: any) {
      console.error(`Error updating message batches (detailed): ${JSON.stringify(error)}`);
      console.error(`Error stack: ${error.stack}`);
      throw new functions.https.HttpsError(
        'internal',
        `Error updating message batches: ${error.message}`
      );
    }
    
    return {
      success: true,
      archivedCount: allMessages.length - KEEP_RECENT,
      archivePath
    };
  } catch (error: any) {
    console.error(`Error in manualArchive (detailed): ${JSON.stringify(error)}`);
    console.error(`Error stack: ${error.stack}`);
    
    // Return a more specific error message to the client
    let errorMessage = 'An error occurred while archiving messages.';
    if (error.message) {
      errorMessage = `Error: ${error.message}`;
    }
    
    if (error.code && error.code.includes('permission-denied')) {
      errorMessage = 'Permission denied: You may not have access to the storage bucket.';
    }
    
    throw new functions.https.HttpsError(
      'internal',
      errorMessage
    );
  }
}); 