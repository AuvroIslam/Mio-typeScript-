# Message Archiving System

This document outlines the message archiving system for the Mio app, which moves older messages from Firestore to Firebase Storage to reduce database size and costs.

## Overview

As conversations grow, keeping all messages in Firestore can become expensive and inefficient. The message archiving system:

1. Moves older messages from Firestore to Firebase Storage as JSON files
2. Keeps only the most recent messages in Firestore for immediate access
3. Loads archived messages on-demand when users scroll up in a conversation
4. Caches downloaded archives to minimize Storage reads

## Architecture

The system consists of:

1. **Firebase Functions** for automated archiving (`functions/src/index.ts`)
2. **Client-side utilities** for retrieving archived messages (`lib/archiveUtils.ts`)
3. **Chat component** modifications to handle archive loading (`app/(conversations)/chat.tsx`)

## Configuration

Key parameters are defined in the Firebase Functions:

- `ARCHIVE_THRESHOLD`: Number of messages that triggers archiving (default: 100)
- `KEEP_RECENT`: Number of recent messages to keep in Firestore (default: 50)

## How Archiving Works

### Automated Background Process

1. A scheduled Firebase Function runs daily to check all conversations
2. For conversations exceeding `ARCHIVE_THRESHOLD` messages:
   - The oldest messages exceeding `KEEP_RECENT` are retrieved
   - Messages are stored as a JSON file in Firebase Storage at `archives/{conversationId}/{timestamp}.json`
   - The conversation document is updated with archive metadata
   - The archived messages are deleted from Firestore

### Manual Archiving

- A callable Firebase Function allows manual archiving of a conversation
- This can be triggered by an admin or when a user reports performance issues

## Client-Side Implementation

### Archive Loading

When a user scrolls up in a conversation:

1. The app first loads all messages from Firestore
2. When no more Firestore messages are available, it checks if archives exist
3. Archives are loaded one by one as the user continues scrolling up
4. Downloaded archives are cached in AsyncStorage to minimize Storage reads

### Cache Management

- Archived messages are cached with a 24-hour expiry
- Cache is cleared when a user unmounts a conversation or forces a refresh
- Each archive has its own cache entry to enable granular loading

## Deployment Requirements

To deploy the archiving system:

1. Deploy the Firebase Functions:
   ```
   cd functions
   npm install
   npm run deploy
   ```

2. Ensure Storage security rules permit reading archives by conversation participants
3. Check Firestore rules to allow the archiving function to modify conversations

## Monitoring and Maintenance

- The Firebase Functions Console shows execution logs for debugging
- Functions include comprehensive error handling and logging
- Manual testing can be performed via the `manualArchive` function

## Future Improvements

Potential enhancements:

- Add a UI indicator showing when archived messages are being loaded
- Implement more sophisticated caching strategies for very active users
- Create an admin interface for managing archives and forcing archiving 