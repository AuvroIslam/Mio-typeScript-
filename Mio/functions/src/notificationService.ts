import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { Expo, ExpoPushMessage } from "expo-server-sdk";

// Initialize Expo SDK
const expo = new Expo();

/**
 * Sends push notifications to a list of users
 * @param tokens - Array of Expo push tokens
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Optional data to send with the notification
 * @returns Promise that resolves when notifications are sent
 */
export async function sendPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, any> = {}
): Promise<void> {
  // Filter out invalid tokens
  const validTokens = tokens.filter((token) => 
    token && Expo.isExpoPushToken(token)
  );

  if (validTokens.length === 0) {
    functions.logger.info("No valid push tokens found");
    return;
  }

  // Create messages for each token
  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
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
        if (ticket.status === "error") {
          const error = ticket.details?.error;
          functions.logger.error("Error sending notification", { 
            token: chunk[index].to, 
            error 
          });
          
          // Handle specific error types
          if (error === "DeviceNotRegistered") {
            // Remove invalid token from user's record
            handleInvalidToken(chunk[index].to as string);
          }
        }
      });
    } catch (error) {
      functions.logger.error("Error sending notifications chunk", error);
    }
  }
}

/**
 * Handles an invalid token by removing it from the user's record
 * @param token - The invalid Expo push token
 */
async function handleInvalidToken(token: string): Promise<void> {
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
  } catch (error) {
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
export async function sendMatchNotification(
  recipientId: string,
  matchingUserId: string,
  matchingUserName: string,
  matchLevel: "match" | "superMatch"
): Promise<void> {
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
    if (recipientData.profile.notificationSettings?.matchNotifications === false) {
      functions.logger.info("Recipient has opted out of match notifications", { recipientId });
      return;
    }
    
    const token = recipientData.profile.pushToken;
    
    // Create notification message
    const isSuper = matchLevel === "superMatch";
    const title = isSuper ? "New Super Match! 🌟" : "New Match! 🎉";
    const body = `You matched with ${matchingUserName}! ${isSuper ? "You have a lot in common!" : ""}`;
    
    // Send the notification
    await sendPushNotifications(
      [token],
      title,
      body,
      {
        type: "match",
        matchId: matchingUserId,
        matchLevel
      }
    );
    
    // Log notification sent
    functions.logger.info("Match notification sent", {
      recipientId,
      matchingUserId,
      matchLevel
    });
  } catch (error) {
    functions.logger.error("Error sending match notification", error);
  }
}
