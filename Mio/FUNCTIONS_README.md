# Firebase Cloud Functions for Message Archiving

This implementation moves the message archiving logic from client-side to server-side using Firebase Cloud Functions. This change addresses several potential issues in a production environment with 1000+ users:

## Benefits of Cloud Functions Implementation

1. **Reliability**: Archiving now happens on the server, eliminating issues with client-side archiving like interrupted operations when users close the app or lose connection.

2. **Concurrency Control**: Prevents race conditions when multiple users might try to archive the same conversation simultaneously.

3. **Performance**: Reduces client device load by moving the heavy lifting of archiving to the server.

4. **Security**: Allows for more controlled access patterns through Admin SDK rather than requiring broad client permissions.

## Functions Implemented

### 1. Scheduled Function (`scheduleMessageArchiving`)
- Runs daily to check all conversations that need archiving
- Processes conversations with message counts above the threshold

### 2. Firestore Trigger (`triggerMessageArchiving`)
- Runs when a conversation document is updated
- Checks if the message count has crossed the threshold
- Uses a locking mechanism to prevent concurrent archiving operations

### 3. Callable Function (`manualArchiveMessages`)
- Optional HTTP callable function for admin-triggered archiving
- Can be used for manual maintenance or testing

## Client-Side Changes

The following changes were made to the client-side code:

1. Removed `archiveOldMessageBatches` and `checkIfArchivingNeeded` functions from `messageArchive.ts`
2. Retained `fetchArchivedMessages` and `getArchiveMetadata` for reading archive data
3. Removed client-side archive triggering from `chat.tsx` after sending messages
4. Removed `checkAndRunArchive` function from `chat.tsx`

## Deployment Instructions

1. Install dependencies in the functions directory:
   ```
   cd Mio/functions
   npm install
   ```

2. Build the TypeScript code:
   ```
   npm run build
   ```

3. Deploy the functions:
   ```
   firebase deploy --only functions
   ```

## Configuration

Configuration constants in both `functions/src/index.ts` and `utils/messageArchive.ts`:

- `MESSAGE_BATCH_SIZE`: Number of messages per batch (default: 20)
- `BATCHES_TO_KEEP`: Number of recent batches to keep in Firestore (default: 3)
- `ARCHIVE_THRESHOLD`: Total message count threshold for archiving (default: 60)

**Note**: If you change these values, make sure they match between the client and server code!

## Server vs. Client Responsibilities

- **Server (Cloud Functions)**: Performing the archiving process (reading batches, creating archives, updating metadata, deleting old batches)
- **Client**: Reading archives when needed, displaying messages, handling UI 