"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteConversationData = exports.manualArchiveMessages = exports.scheduleMessageArchiving = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const firestore_1 = require("firebase-admin/firestore"); // Import FieldValue
// Initialize Firebase Admin
admin.initializeApp();
// Configuration constants (same as in client)
const MESSAGE_BATCH_SIZE = 20; // Number of messages per batch
const BATCHES_TO_KEEP = 3; // Keep this many recent batches in Firestore
const ARCHIVE_THRESHOLD = BATCHES_TO_KEEP * MESSAGE_BATCH_SIZE; // When to archive
/**
 * Helper function to delete a Firestore collection in batches.
 * @param {admin.firestore.CollectionReference} collectionRef Reference to the collection.
 * @param {number} batchSize Size of batches to delete.
 * @return {Promise<void>}
 */
async function deleteCollection(collectionRef, batchSize = 50) {
    const query = collectionRef.orderBy("__name__").limit(batchSize);
    // Keep deleting batches until the collection is empty
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const snapshot = await query.get();
        if (snapshot.size === 0) {
            break;
        }
        // Create a new batch write
        const batch = admin.firestore().batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        // Log progress
        functions.logger.info(`Deleted ${snapshot.size} documents from ${collectionRef.path}`);
    }
}
/**
 * Helper function to delete all files within a Firebase Storage folder.
 * @param {string} folderPath Path to the folder in Storage.
 * @return {Promise<void>}
 */
async function deleteStorageFolder(folderPath) {
    const bucket = admin.storage().bucket();
    try {
        // List all files in the folder
        const [files] = await bucket.getFiles({ prefix: folderPath });
        if (files.length === 0) {
            functions.logger.info(`No files found in Storage folder: ${folderPath}`);
            return;
        }
        // Delete each file
        const deletePromises = files.map((file) => file.delete());
        await Promise.all(deletePromises);
        functions.logger.info(`Deleted ${files.length} files from Storage folder: ${folderPath}`);
    }
    catch (error) {
        // Log error but don't necessarily fail the whole function if storage cleanup fails
        functions.logger.error(`Error deleting Storage folder ${folderPath}:`, error);
    }
}
/**
 * Scheduled function that runs daily to check which conversations need archiving
 * This is more reliable than client-triggered archiving
 */
exports.scheduleMessageArchiving = functions.pubsub
    .schedule("every 2 minutes") // Set to 2 mins for testing, change back later!
    .onRun(async () => {
    try {
        const db = admin.firestore();
        // Get conversations that need archiving
        const conversationsSnapshot = await db.collection("conversations")
            .where("messageCount", ">=", ARCHIVE_THRESHOLD)
            .get();
        if (conversationsSnapshot.empty) {
            functions.logger.info("No conversations need archiving");
            return null;
        }
        // Process each conversation
        // Note: This could process many conversations in parallel.
        // Consider using Promise.allSettled or batching if necessary at larger scale.
        const promises = conversationsSnapshot.docs.map(async (doc) => {
            const conversationId = doc.id;
            // Check if conversationData indicates it's already being archived by another process
            // (e.g., if manual trigger was used recently - requires adding the flag back)
            // For simplicity now, we assume the schedule is the main driver or manual calls are rare.
            await archiveOldMessageBatches(conversationId);
        });
        await Promise.all(promises);
        functions.logger.info(`Scheduled archiving complete, processed ${conversationsSnapshot.size} conversations`);
        return null;
    }
    catch (error) {
        functions.logger.error("Error in scheduled archiving:", error);
        return null;
    }
});
/**
 * Archive old message batches to Firebase Storage
 * @param {string} conversationId The conversation ID
 * @return {Promise<object>} Promise with archive results
 */
async function archiveOldMessageBatches(conversationId) {
    try {
        const db = admin.firestore();
        // Get conversation document first to check if archiving is needed
        const conversationRef = db.collection("conversations").doc(conversationId);
        const conversationDoc = await conversationRef.get();
        if (!conversationDoc.exists) {
            return {
                success: false,
                error: "Conversation not found",
            };
        }
        const conversationData = conversationDoc.data();
        if (!conversationData) {
            return {
                success: false,
                error: "Conversation data is null",
            };
        }
        const messageCount = conversationData.messageCount || 0;
        // Skip if message count is below threshold
        if (messageCount < ARCHIVE_THRESHOLD) {
            return {
                success: true,
                error: "No need to archive yet",
            };
        }
        functions.logger.info(`Archiving messages for conversation ${conversationId} with ${messageCount} messages`);
        // Get all message batches for the conversation, ordered by endTime (oldest first)
        const batchesRef = db.collection(`conversations/${conversationId}/messageBatches`);
        const batchesSnapshot = await batchesRef
            .orderBy("endTime", "asc")
            .get();
        if (batchesSnapshot.empty) {
            return {
                success: false,
                error: "No message batches found",
            };
        }
        // Calculate how many batches to keep vs. archive
        const totalBatches = batchesSnapshot.docs.length;
        const batchesToArchive = Math.max(0, totalBatches - BATCHES_TO_KEEP);
        if (batchesToArchive <= 0) {
            return {
                success: true,
                error: "Not enough batches to archive",
            };
        }
        functions.logger.info(`Will archive ${batchesToArchive} of ${totalBatches} batches`);
        // Collect batches to archive
        const archiveBatches = [];
        const batchIds = [];
        batchesSnapshot.docs.slice(0, batchesToArchive).forEach((doc) => {
            const batchData = doc.data();
            batchData.id = doc.id;
            archiveBatches.push(batchData);
            batchIds.push(doc.id);
        });
        // Create archive JSON
        const totalMessagesInArchive = archiveBatches.reduce((count, batch) => count + batch.messages.length, 0);
        const archiveData = {
            conversationId,
            batches: archiveBatches,
            totalMessages: totalMessagesInArchive,
            oldestTimestamp: archiveBatches[0].startTime,
            newestTimestamp: archiveBatches[archiveBatches.length - 1].endTime,
            archivedAt: new Date().toISOString(),
        };
        // Generate timestamp for the archive file name
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const archivePath = `archives/${conversationId}/${timestamp}.json`;
        // Create a temp file first since Firebase storage needs a file
        const tempLocalFile = path.join(os.tmpdir(), `archive-${timestamp}.json`);
        fs.writeFileSync(tempLocalFile, JSON.stringify(archiveData));
        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        await bucket.upload(tempLocalFile, {
            destination: archivePath,
            metadata: {
                contentType: "application/json",
            },
        });
        // Clean up temp file
        fs.unlinkSync(tempLocalFile);
        functions.logger.info(`Uploaded archive to ${archivePath}`);
        // Update conversation document with archive info
        const archiveMetadata = {
            path: archivePath,
            count: archiveData.totalMessages,
            oldestTimestamp: archiveData.oldestTimestamp,
            newestTimestamp: archiveData.newestTimestamp,
            createdAt: new Date(),
        };
        // Use a transaction to update the conversation and delete batches
        await db.runTransaction(async (transaction) => {
            // Update conversation document with archive metadata
            transaction.update(conversationRef, {
                archivedMessages: firestore_1.FieldValue.increment(archiveData.totalMessages),
                archives: firestore_1.FieldValue.arrayUnion(archiveMetadata),
            });
            // Delete archived batches from Firestore
            for (const batchId of batchIds) {
                const batchRef = db
                    .collection(`conversations/${conversationId}/messageBatches`)
                    .doc(batchId);
                transaction.delete(batchRef);
            }
        });
        functions.logger.info(`Successfully archived ${totalMessagesInArchive} messages ` +
            `from conversation ${conversationId}`);
        return {
            success: true,
            archivePath,
            archivedBatchIds: batchIds,
        };
    }
    catch (error) {
        functions.logger.error(`Error archiving messages for conversation ${conversationId}:`, error);
        return {
            success: false,
            error: `Failed to archive messages: ${error}`,
        };
    }
}
/**
 * HTTP function to manually trigger archiving for a specific conversation
 * This can be called from admin tools if needed
 */
exports.manualArchiveMessages = functions.https.onCall(async (data, context) => {
    // Check if the request is made by an authenticated user
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const conversationId = data.conversationId;
    if (!conversationId) {
        throw new functions.https.HttpsError("invalid-argument", "The function requires a conversationId parameter.");
    }
    try {
        const result = await archiveOldMessageBatches(conversationId);
        return result;
    }
    catch (error) {
        throw new functions.https.HttpsError("internal", `Error archiving messages: ${error}`);
    }
});
/**
 * Internal helper to perform the actual deletion steps for a conversation.
 * Assumes conversationRef is valid.
 * @param {string} conversationId The ID of the conversation.
 * @param {admin.firestore.DocumentReference} conversationRef Reference to the conversation document.
 * @return {Promise<void>}
 */
async function performConversationDeletion(conversationId, conversationRef) {
    // Delete messageBatches subcollection
    const batchesRef = conversationRef.collection("messageBatches");
    await deleteCollection(batchesRef); // Use helper function
    functions.logger.info(`Deleted messageBatches subcollection for conversation ${conversationId}`);
    // Delete Storage archives folder
    const storageFolderPath = `archives/${conversationId}/`;
    await deleteStorageFolder(storageFolderPath); // Use helper function
    functions.logger.info(`Deleted Storage folder ${storageFolderPath}`);
    // Delete the main conversation document
    await conversationRef.delete();
    functions.logger.info(`Deleted main conversation document ${conversationId}`);
}
/**
 * HTTPS Callable function to delete all data associated with a conversation.
 * Called when a user unmatches or blocks another user.
 */
exports.deleteConversationData = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const currentUserId = context.auth.uid;
    const otherUserId = data.otherUserId;
    if (!otherUserId || typeof otherUserId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "The function requires an 'otherUserId' parameter (string).");
    }
    const db = admin.firestore();
    try {
        // 2. Find the conversation document
        const conversationsRef = db.collection("conversations");
        const q = conversationsRef
            .where("participants", "array-contains", currentUserId);
        const querySnapshot = await q.get();
        let conversationId = null;
        let conversationRef = null;
        querySnapshot.forEach((doc) => {
            const participants = doc.data().participants;
            if (participants && participants.includes(otherUserId)) {
                conversationId = doc.id;
                conversationRef = doc.ref;
            }
        });
        // 3. If conversation exists, proceed with deletion
        if (conversationId && conversationRef) {
            // Split the log message into two parts
            functions.logger.info(`Found conversation ${conversationId} between ${currentUserId} and ${otherUserId}.`);
            functions.logger.info("Preparing for deletion.");
            // Call the dedicated deletion helper function
            await performConversationDeletion(conversationId, conversationRef);
            return {
                success: true,
                message: `Successfully deleted conversation data for ${conversationId}`,
            };
        }
        else {
            functions.logger.info(`No conversation found between ${currentUserId} and ${otherUserId}. ` +
                "No data deleted.");
            // It's okay if no conversation exists, maybe they unmatched before chatting
            return {
                success: true,
                message: "No active conversation found to delete.",
            };
        }
    }
    catch (error) {
        // Break the logger call to satisfy max-len
        functions.logger.error(`Error deleting conversation data between ${currentUserId} and ${otherUserId}:`, error);
        // Check if error is an object with a message property before accessing it
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new functions.https.HttpsError("internal", `Failed to delete conversation data: ${errorMessage}`);
    }
});
//# sourceMappingURL=index.js.map