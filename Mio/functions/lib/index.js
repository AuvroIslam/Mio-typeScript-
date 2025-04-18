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
exports.deleteUserAccount = exports.getTMDBData = exports.setAdminClaim = exports.checkAdminStatus = exports.getCloudinarySignature = exports.searchUserMatches = exports.deleteConversationData = exports.manualArchiveMessages = exports.scheduleMessageArchiving = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const firestore_1 = require("firebase-admin/firestore"); // Import FieldValue
const crypto = __importStar(require("crypto"));
// Initialize Firebase Admin
admin.initializeApp();
// Configuration constants (same as in client)
const MESSAGE_BATCH_SIZE = 20; // Number of messages per batch
const BATCHES_TO_KEEP = 3; // Keep this many recent batches in Firestore
const ARCHIVE_THRESHOLD = BATCHES_TO_KEEP * MESSAGE_BATCH_SIZE; // When to archive
// Constants for matching algorithm (same as in client)
const MATCH_THRESHOLD = 3;
const SUPER_MATCH_THRESHOLD = 7;
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
    .schedule("every 24 hours") // Set to 2 mins for testing, change back later!
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
/**
 * Cloud function to search for user matches
 * This moves the matching algorithm to the server for better security and performance
 */
exports.searchUserMatches = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const currentUserId = context.auth.uid;
    const currentUserFavoriteShowIds = data.favoriteShowIds || []; // Renamed for clarity
    try {
        const db = admin.firestore();
        const userRef = db.collection("users").doc(currentUserId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError("not-found", "User profile not found.");
        }
        const userData = userDoc.data();
        const userProfile = userData === null || userData === void 0 ? void 0 : userData.profile;
        const existingMatches = (userData === null || userData === void 0 ? void 0 : userData.matches) || [];
        const blockedUsers = (userProfile === null || userProfile === void 0 ? void 0 : userProfile.blockedUsers) || [];
        if (!userProfile || !userProfile.displayName || !userProfile.age || !userProfile.gender) {
            throw new functions.https.HttpsError("failed-precondition", "Please complete your profile before searching for matches.");
        }
        if (currentUserFavoriteShowIds.length === 0) {
            throw new functions.https.HttpsError("failed-precondition", "Add some favorite shows first to find matches!");
        }
        // OPTIMIZATION 1: Use Sets
        const existingMatchIds = new Set(existingMatches.map((match) => match.userId));
        const blockedUsersSet = new Set(blockedUsers);
        // OPTIMIZATION 2: Pre-fetch preferences
        const userGenderPreference = userProfile.matchWith || "everyone";
        const userLocationPreference = userProfile.matchLocation || "worldwide";
        const userLocation = userProfile.location || "";
        const userGender = userProfile.gender || "";
        // Update showUsers collection for each favorite show - still necessary
        const batch = db.batch();
        for (const showId of currentUserFavoriteShowIds) {
            const showUserRef = db.collection("showUsers").doc(showId);
            batch.set(showUserRef, {
                showId: showId,
                users: admin.firestore.FieldValue.arrayUnion(currentUserId),
            }, { merge: true });
        }
        await batch.commit();
        // OPTIMIZATION 3 & 4: Find and filter potential matches
        const potentialUserMap = new Map();
        for (const showId of currentUserFavoriteShowIds) {
            const showUserDoc = await db.collection("showUsers").doc(showId).get();
            if (showUserDoc.exists) {
                const showData = showUserDoc.data();
                const userIds = (showData === null || showData === void 0 ? void 0 : showData.users) || [];
                for (const userId of userIds) {
                    if (userId === currentUserId || existingMatchIds.has(userId) || blockedUsersSet.has(userId)) {
                        continue;
                    }
                    potentialUserMap.set(userId, (potentialUserMap.get(userId) || 0) + 1);
                }
            }
        }
        const potentialUserIds = Array.from(potentialUserMap.keys())
            .filter((userId) => (potentialUserMap.get(userId) || 0) >= MATCH_THRESHOLD);
        // Calculate cooldown time before potential early return
        const now = new Date();
        const newSearchCount = ((userData === null || userData === void 0 ? void 0 : userData.matchSearchCount) || 0) + 1;
        functions.logger.info(`[COOLDOWN-FUNCTION] Setting newSearchCount to ${newSearchCount}`);
        // Calculate cooldown time based on search count
        let cooldownMinutes;
        const COOLDOWN_MINUTES = {
            FIRST: 1,
            SECOND: 2,
            THIRD: 5, // 5 minutes
        };
        if (newSearchCount % 3 === 1) {
            cooldownMinutes = COOLDOWN_MINUTES.FIRST;
        }
        else if (newSearchCount % 3 === 2) {
            cooldownMinutes = COOLDOWN_MINUTES.SECOND;
        }
        else {
            cooldownMinutes = COOLDOWN_MINUTES.THIRD;
        }
        const cooldownEnd = new Date(now.getTime() + cooldownMinutes * 60 * 1000);
        functions.logger.info(`[COOLDOWN-FUNCTION] Calculated cooldown: ${cooldownMinutes} minutes, ends at ${cooldownEnd.toISOString()}`);
        // Update user's search count and cooldown time
        await userRef.update({
            matchSearchCount: newSearchCount,
            lastMatchSearch: now,
            cooldownEndTime: cooldownEnd,
        });
        functions.logger.info(`[COOLDOWN-FUNCTION] Updated user document with new cooldown information`);
        if (potentialUserIds.length === 0) {
            // Even with no matches, we still return the cooldown information
            const responseObject = {
                success: true,
                newMatches: [],
                matchCount: 0,
                cooldownEnd: cooldownEnd.toISOString(),
                message: "No new matches found"
            };
            // Debug log the final response object
            functions.logger.info("[COOLDOWN-FUNCTION] FINAL RESPONSE: " + JSON.stringify(responseObject));
            return responseObject;
        }
        // OPTIMIZATION 5 & 6: Batch get profiles and prepare match data
        const batchSize = 10;
        const newMatchesData = []; // This will be the final list sent back
        const batchWriteUpdates = new Map(); // Store updates for batch write
        for (let i = 0; i < potentialUserIds.length; i += batchSize) {
            const batchIds = potentialUserIds.slice(i, i + batchSize);
            const userRefs = batchIds.map((id) => db.collection("users").doc(id));
            const userDocs = await db.getAll(...userRefs);
            for (const userDoc of userDocs) {
                if (!userDoc.exists)
                    continue;
                const matchedUserId = userDoc.id;
                const matchUserData = userDoc.data();
                const matchUserProfile = (matchUserData === null || matchUserData === void 0 ? void 0 : matchUserData.profile) || {};
                // Skip if profile is incomplete
                if (!matchUserProfile.displayName || !matchUserProfile.gender)
                    continue;
                // Check if potential match has blocked current user
                const matchUserBlockedList = matchUserProfile.blockedUsers || [];
                if (matchUserBlockedList.includes(currentUserId))
                    continue;
                // Check mutual match criteria
                const preferredGender = matchUserProfile.matchWith || "everyone";
                const matchUserGender = matchUserProfile.gender;
                const locationPreference = matchUserProfile.matchLocation || "worldwide";
                const matchUserLocation = matchUserProfile.location || "";
                // Check mutual preference matches
                const genderMatch = (userGenderPreference === "everyone" || userGenderPreference === matchUserGender) &&
                    (preferredGender === "everyone" || preferredGender === userGender);
                const locationMatch = (userLocationPreference !== "local" || userLocation === matchUserLocation) &&
                    (locationPreference !== "local" || matchUserLocation === userLocation);
                if (!genderMatch || !locationMatch)
                    continue;
                // Get common show count (needed for match level)
                const commonShowCount = potentialUserMap.get(matchedUserId) || 0;
                const matchLevel = commonShowCount >= SUPER_MATCH_THRESHOLD ? "superMatch" : "match";
                // Get matched user's favorite shows (needed for profile screen)
                const matchUserFavoriteShowIds = matchUserProfile.favoriteShows || [];
                // Create match object for current user (WITHOUT commonShowIds)
                const matchDataForCurrentUser = {
                    userId: matchedUserId,
                    displayName: matchUserProfile.displayName,
                    profilePic: matchUserProfile.profilePic || "",
                    matchLevel: matchLevel,
                    favoriteShowIds: matchUserFavoriteShowIds,
                    matchTimestamp: admin.firestore.Timestamp.now(),
                    age: matchUserProfile.age || "",
                    gender: matchUserProfile.gender || "",
                    location: matchUserProfile.location || "",
                    chattingWith: false,
                };
                // Create match object for the matched user (WITHOUT commonShowIds)
                const matchDataForMatchedUser = {
                    userId: currentUserId,
                    displayName: userProfile.displayName,
                    profilePic: userProfile.profilePic || "",
                    matchLevel: matchLevel,
                    favoriteShowIds: currentUserFavoriteShowIds,
                    matchTimestamp: admin.firestore.Timestamp.now(),
                    age: userProfile.age || "",
                    gender: userProfile.gender || "",
                    location: userProfile.location || "",
                    chattingWith: false,
                };
                // Add to list to be returned to client
                newMatchesData.push(matchDataForCurrentUser);
                // Prepare for batch write
                batchWriteUpdates.set(matchedUserId, {
                    matchData: matchDataForCurrentUser,
                    otherUserMatchData: matchDataForMatchedUser,
                });
            }
        }
        // OPTIMIZATION 7: Batch write matches (using the modified MatchData)
        if (batchWriteUpdates.size > 0) {
            const writeBatch = db.batch();
            for (const [matchedUserId, profiles] of batchWriteUpdates.entries()) {
                // Add match to current user
                writeBatch.update(userRef, {
                    matches: admin.firestore.FieldValue.arrayUnion(profiles.matchData),
                });
                // Add match to matched user
                const matchedUserRef = db.collection("users").doc(matchedUserId);
                writeBatch.update(matchedUserRef, {
                    matches: admin.firestore.FieldValue.arrayUnion(profiles.otherUserMatchData),
                });
            }
            await writeBatch.commit();
        }
        // IMPORTANT: Always include cooldownEnd in the response object
        // This ensures the client gets the cooldown info regardless of match count
        const responseObject = {
            success: true,
            newMatches: newMatchesData,
            matchCount: newMatchesData.length,
            cooldownEnd: cooldownEnd.toISOString(),
            message: newMatchesData.length > 0 ? `Found ${newMatchesData.length} new matches!` : "No new matches found"
        };
        // Debug log the final response object to confirm cooldownEnd is included
        functions.logger.info("[COOLDOWN-FUNCTION] FINAL RESPONSE: " + JSON.stringify(responseObject));
        return responseObject;
    }
    catch (error) {
        functions.logger.error("Error in searchUserMatches:", error);
        throw new functions.https.HttpsError("internal", `Failed to search for matches: ${error.message || error}`);
    }
});
// Cloudinary signed upload function
exports.getCloudinarySignature = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    try {
        // Get Cloudinary credentials from environment
        const apiKey = functions.config().cloudinary.api_key;
        const apiSecret = functions.config().cloudinary.api_secret;
        const cloudName = functions.config().cloudinary.cloud_name;
        const uploadPreset = functions.config().cloudinary.upload_preset;
        // Create parameters for the signature
        const timestamp = Math.round(new Date().getTime() / 1000);
        const folder = "mio_app_profiles";
        // Create the string to sign
        // Note: Include all parameters that should be signed
        const stringToSign = `folder=${folder}&timestamp=${timestamp}&upload_preset=${uploadPreset}${apiSecret}`;
        // Create signature
        const signature = crypto
            .createHash("sha1")
            .update(stringToSign)
            .digest("hex");
        // Return data needed for signed upload
        return {
            signature,
            timestamp,
            cloudName,
            apiKey,
            folder,
            uploadPreset,
        };
    }
    catch (error) {
        console.error("Error generating Cloudinary signature:", error);
        throw new functions.https.HttpsError("internal", "Unable to generate signature");
    }
});
// Function to check if a user is an admin
exports.checkAdminStatus = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    try {
        // Get admin email from config
        const adminEmail = functions.config().admin.email;
        // If user's email matches admin email, return true
        if (context.auth.token.email === adminEmail) {
            return { isAdmin: true };
        }
        return { isAdmin: false };
    }
    catch (error) {
        console.error("Error checking admin status:Z", error);
        throw new functions.https.HttpsError("internal", "Unable to check admin status");
    }
});
// Function to set admin claim on a user
// This should be called manually by you (the developer) when needed
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Check if the requester is already an admin
    if (!context.auth || !context.auth.token.email) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    // Get admin email from config
    const adminEmail = functions.config().admin.email;
    // Only allow the admin email to set admin claims
    if (context.auth.token.email !== adminEmail) {
        throw new functions.https.HttpsError("permission-denied", "Only admins can set admin claims");
    }
    // Validate data
    if (!data.email) {
        throw new functions.https.HttpsError("invalid-argument", "Email is required");
    }
    try {
        // Get the user by email
        const userRecord = await admin.auth().getUserByEmail(data.email);
        // Set admin claim
        await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
        return { success: true, message: `Admin claim set successfully for user: ${data.email}` };
    }
    catch (error) {
        console.error("Error setting admin claim:", error);
        throw new functions.https.HttpsError("internal", "Unable to set admin claim");
    }
});
// Function to proxy TMDB API requests
exports.getTMDBData = functions.https.onCall(async (data, context) => {
    var _a;
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    try {
        // Validate required parameters
        const { endpoint, params } = data;
        if (!endpoint) {
            throw new functions.https.HttpsError("invalid-argument", "The 'endpoint' parameter is required.");
        }
        // Get TMDB API key from config
        const apiKey = (_a = functions.config().tmdb) === null || _a === void 0 ? void 0 : _a.api_key; // Use optional chaining
        if (!apiKey) {
            console.error("TMDB API key is missing in Firebase function config.");
            throw new functions.https.HttpsError("failed-precondition", "TMDB API key is not configured.");
        }
        // Construct the URL with query parameters
        const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        let url = `https://api.themoviedb.org/3${safeEndpoint}?api_key=${apiKey}`;
        // Add any additional parameters
        if (params && typeof params === "object") {
            Object.entries(params).forEach(([key, value]) => {
                url += `&${key}=${encodeURIComponent(String(value))}`;
            });
        }
        // NOTE: 'fetch' is globally available in newer Cloud Functions runtimes (Node 18+)
        // If using an older runtime, you might need to import 'node-fetch'
        // import fetch from 'node-fetch';
        const response = await fetch(url);
        if (!response.ok) {
            const errorBody = await response.text(); // Get error details from TMDB
            functions.logger.error(`TMDB API error for URL ${url}: ${response.status} ${response.statusText}`, { errorBody });
            throw new functions.https.HttpsError("internal", // Use a more specific code like 'unavailable' if appropriate
            `TMDB API error: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        return result;
    }
    catch (error) {
        functions.logger.error("Error fetching from TMDB:", error);
        // Re-throw HttpsErrors directly, wrap others
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", `Failed to fetch TMDB data: ${error.message || String(error)}`);
    }
});
/**
 * HTTPS Callable function to delete a user's account and all associated data.
 */
exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const userIdToDelete = context.auth.uid;
    functions.logger.info(`Attempting to delete account for user: ${userIdToDelete}`);
    const db = admin.firestore();
    const batch = db.batch(); // Use a batch for multiple Firestore writes
    try {
        // 2. Get User Data (including matches and favorite shows)
        const userRef = db.collection("users").doc(userIdToDelete);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            functions.logger.warn(`User document ${userIdToDelete} not found. Attempting to delete Auth account anyway.`);
            // Proceed to delete Auth account even if Firestore doc is missing
        }
        else {
            const userData = userDoc.data() || {};
            // Read fields according to the detailed structure provided
            const userMatches = userData.matches || []; // Assuming MatchData type is defined/imported
            const userProfile = userData.profile || {}; // Get the profile map
            const userFavoriteShows = userProfile.favoriteShows || []; // Read from profile map
            // 3. Cleanup Matches: Remove deleting user from other users' match lists
            if (userMatches.length > 0) {
                functions.logger.info(`Cleaning up matches for ${userIdToDelete}. Found ${userMatches.length} matches.`);
                const matchedUserIds = userMatches.map((match) => match.userId);
                const matchedUserRefs = matchedUserIds.map((id) => db.collection("users").doc(id));
                // Batch read matched user docs for efficiency
                if (matchedUserRefs.length > 0) {
                    const matchedUserDocs = await db.getAll(...matchedUserRefs);
                    matchedUserDocs.forEach((matchedUserDoc) => {
                        if (matchedUserDoc.exists) {
                            const matchedUserId = matchedUserDoc.id;
                            const matchedUserData = matchedUserDoc.data() || {};
                            const otherUserMatches = matchedUserData.matches || [];
                            // Filter out the user being deleted
                            const updatedMatches = otherUserMatches.filter((m) => m.userId !== userIdToDelete);
                            // Update only if the matches list changed
                            if (updatedMatches.length < otherUserMatches.length) {
                                batch.update(matchedUserDoc.ref, { matches: updatedMatches });
                                functions.logger.info(`Scheduled removal of ${userIdToDelete} from matches of ${matchedUserId}`);
                            }
                        }
                        else {
                            // Log if a matched user document wasn't found (might have been deleted)
                            functions.logger.warn(`Matched user document ${matchedUserDoc.id} not found during cleanup for ${userIdToDelete}.`);
                        }
                    });
                }
            }
            else {
                functions.logger.info(`No matches to clean up for user ${userIdToDelete}.`);
            }
            // 4. Cleanup showUsers: Remove user from show lists
            if (userFavoriteShows.length > 0) {
                functions.logger.info(`Cleaning up ${userFavoriteShows.length} showUsers entries for ${userIdToDelete}.`);
                for (const showId of userFavoriteShows) {
                    const showUserRef = db.collection("showUsers").doc(showId);
                    // Update using FieldValue.arrayRemove within the batch
                    batch.update(showUserRef, { users: firestore_1.FieldValue.arrayRemove(userIdToDelete) });
                }
            }
            else {
                functions.logger.info(`No favorite shows to clean up for user ${userIdToDelete}.`);
            }
            // 5. Cleanup Conversations
            functions.logger.info(`Querying conversations involving ${userIdToDelete} for deletion.`);
            const conversationsRef = db.collection("conversations");
            const conversationsQuery = conversationsRef.where("participants", "array-contains", userIdToDelete);
            const conversationsSnapshot = await conversationsQuery.get();
            if (!conversationsSnapshot.empty) {
                functions.logger.info(`Found ${conversationsSnapshot.size} conversations to delete for user ${userIdToDelete}`);
                // Deleting conversations involves subcollections and storage, handle outside the main batch
                // Ensure performConversationDeletion is defined and imported correctly
                const deletionPromises = conversationsSnapshot.docs.map((convDoc) => performConversationDeletion(convDoc.id, convDoc.ref));
                const results = await Promise.allSettled(deletionPromises);
                results.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        functions.logger.error(`Failed to delete conversation ${conversationsSnapshot.docs[index].id}:`, result.reason);
                    }
                });
                functions.logger.info(`Finished attempting deletion of ${conversationsSnapshot.size} conversations for ${userIdToDelete}`);
            }
            else {
                functions.logger.info(`No conversations found involving user ${userIdToDelete}.`);
            }
            // 6. Add User Document to the batch for deletion
            batch.delete(userRef);
            functions.logger.info(`Scheduled deletion of user document ${userIdToDelete} in batch.`);
        }
        // Commit the Firestore batch operations (matches, showUsers, user doc)
        await batch.commit();
        functions.logger.info(`Committed Firestore batch deletions for ${userIdToDelete}.`);
        // 7. Delete Auth Account (Must be done *after* Firestore cleanup potentially needing UID)
        await admin.auth().deleteUser(userIdToDelete);
        functions.logger.info(`Successfully deleted Auth account for user: ${userIdToDelete}`);
        // 8. Return Success
        return { success: true, message: "Account deleted successfully." };
    }
    catch (error) {
        functions.logger.error(`Error deleting user account ${userIdToDelete}:`, error);
        // Re-throw HttpsErrors directly, wrap others
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "An error occurred while deleting the account. Please try again later."
        // Consider logging error.message for internal debugging but not sending to client
        );
    }
});
//# sourceMappingURL=index.js.map