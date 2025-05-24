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
exports.sendMatchNotification = exports.sendPushNotifications = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const expo_server_sdk_1 = require("expo-server-sdk");
// Initialize Expo SDK
const expo = new expo_server_sdk_1.Expo();
/**
 * Sends push notifications to a list of users
 * @param tokens - Array of Expo push tokens
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Optional data to send with the notification
 * @returns Promise that resolves when notifications are sent
 */
async function sendPushNotifications(tokens, title, body, data = {}) {
    // Filter out invalid tokens
    const validTokens = tokens.filter((token) => token && expo_server_sdk_1.Expo.isExpoPushToken(token));
    if (validTokens.length === 0) {
        functions.logger.info("No valid push tokens found");
        return;
    }
    // Create messages for each token
    const messages = validTokens.map((token) => ({
        to: token,
        sound: "default",
        title,
        body,
        data,
    }));
    // Chunk messages to avoid Expo rate limits
    const chunks = expo.chunkPushNotifications(messages);
    // Send chunks of notifications
    for (const chunk of chunks) {
        try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            functions.logger.info("Push notification sent", { ticketChunk });
            // Process tickets to handle errors or other statuses
            ticketChunk.forEach((ticket, index) => {
                var _a;
                if (ticket.status === "error") {
                    const error = (_a = ticket.details) === null || _a === void 0 ? void 0 : _a.error;
                    functions.logger.error("Error sending notification", {
                        token: chunk[index].to,
                        error
                    });
                    // Handle specific error types
                    if (error === "DeviceNotRegistered") {
                        // Remove invalid token from user's record
                        handleInvalidToken(chunk[index].to);
                    }
                }
            });
        }
        catch (error) {
            functions.logger.error("Error sending notifications chunk", error);
        }
    }
}
exports.sendPushNotifications = sendPushNotifications;
/**
 * Handles an invalid token by removing it from the user's record
 * @param token - The invalid Expo push token
 */
async function handleInvalidToken(token) {
    try {
        const db = admin.firestore();
        // Find user with this token
        const usersSnapshot = await db
            .collection("users")
            .where("profile.pushToken", "==", token)
            .limit(1)
            .get();
        if (usersSnapshot.empty) {
            functions.logger.info("No user found with invalid token", { token });
            return;
        }
        // Remove token from user's profile
        const userDoc = usersSnapshot.docs[0];
        await userDoc.ref.update({
            "profile.pushToken": null
        });
        functions.logger.info("Removed invalid token from user", { userId: userDoc.id });
    }
    catch (error) {
        functions.logger.error("Error handling invalid token", error);
    }
}
/**
 * Sends a match notification to a user
 * @param recipientId - User ID of the recipient
 * @param matchingUserId - User ID of the user who matched with them
 * @param matchingUserName - Display name of the user who matched with them
 * @param matchLevel - The level of match (match or superMatch)
 */
async function sendMatchNotification(recipientId, matchingUserId, matchingUserName, matchLevel) {
    var _a;
    try {
        const db = admin.firestore();
        // Get recipient's push token
        const recipientDoc = await db.collection("users").doc(recipientId).get();
        if (!recipientDoc.exists) {
            functions.logger.warn("Recipient not found", { recipientId });
            return;
        }
        const recipientData = recipientDoc.data();
        if (!recipientData || !recipientData.profile || !recipientData.profile.pushToken) {
            functions.logger.info("Recipient has no push token", { recipientId });
            return;
        }
        // Check if user has opted out of match notifications
        if (((_a = recipientData.profile.notificationSettings) === null || _a === void 0 ? void 0 : _a.matchNotifications) === false) {
            functions.logger.info("Recipient has opted out of match notifications", { recipientId });
            return;
        }
        const token = recipientData.profile.pushToken;
        // Create notification message
        const isSuper = matchLevel === "superMatch";
        const title = isSuper ? "New Super Match! 🌟" : "New Match! ✨";
        const body = `You matched with ${matchingUserName}! ${isSuper ? "You have a lot in common!" : ""}`;
        // Send the notification
        await sendPushNotifications([token], title, body, {
            type: "match",
            matchId: matchingUserId,
            matchLevel
        });
        // Log notification sent
        functions.logger.info("Match notification sent", {
            recipientId,
            matchingUserId,
            matchLevel
        });
    }
    catch (error) {
        functions.logger.error("Error sending match notification", error);
    }
}
exports.sendMatchNotification = sendMatchNotification;
//# sourceMappingURL=notificationService.js.map