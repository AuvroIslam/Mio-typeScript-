# Matching System Architecture

## Overview

The matching system has been redesigned to move the matching algorithm from client-side to server-side using Firebase Cloud Functions. This change improves:

- **Security**: Prevents client-side manipulation of matching algorithm
- **Performance**: Reduces processing load on mobile devices
- **Network efficiency**: Fewer Firestore operations from client
- **Scalability**: Handles larger user pools without client performance issues
- **Consistency**: Ensures matching rules are applied uniformly

## Implementation

### Cloud Function

The core matching logic now exists in a Firebase Cloud Function called `searchUserMatches` located in `functions/src/index.ts`.

Features:
- Takes user ID and favorite shows as input
- Efficiently searches for users with common shows
- Applies matching rules (gender preferences, location preferences)
- Creates match records for both users in a transactional manner
- Manages cooldown periods server-side
- Returns new matches and updated cooldown time

### Client Changes

The client-side code in `context/MatchContext.tsx` has been updated to:
- Replace local matching algorithm with cloud function calls
- Handle cloud function responses to update UI state
- Maintain the same API for components to preserve compatibility
- Process returned match data and update local state

### Type Definitions

Created a shared types file (`types/match.ts`) to ensure consistency between client and server.

## Technical Details

### Matching Algorithm

1. User initiates search from client
2. Client calls cloud function with user's favorite shows
3. Cloud function:
   - Updates `showUsers` collection
   - Finds users who like the same shows
   - Counts common shows for each potential match
   - Filters users with common show count >= threshold
   - Checks match criteria (gender preference, location)
   - Creates match records for both users
   - Updates cooldown timer
4. Client receives new matches and updates UI

### Performance Optimizations

The matching algorithm has been optimized to reduce database read/write operations:

1. **Early Filtering**: 
   - Uses Sets for fast lookup of existing matches and blocked users
   - Filters out invalid matches before fetching full user profiles
   - Caches user preferences at the beginning to avoid repeated property access

2. **Batch Operations**:
   - Uses batch gets to fetch multiple user profiles at once (10 at a time)
   - Collects all match updates and applies them in a single batch write
   - Reduces the number of Firestore operations from 2N to ~N/10 + 1

3. **Efficient Data Structures**:
   - Uses Maps and Sets for O(1) lookups instead of arrays with O(n) searches
   - Avoids redundant data fetching and processing

These optimizations significantly reduce Firestore read/write operations, especially for users with many favorite shows or in databases with many users.

### Cooldown System

The cooldown system creates a progressive delay between searches:
- 1 minute after first search
- 2 minutes after second search
- 5 minutes after third search
- Cycle repeats

This pattern is now managed server-side to prevent manipulation.

## Migration Notes

The migration was done without changing the user interface or experience. All components interacting with the MatchContext will continue to work without changes.

Components affected:
- `app/(tabs)/match.tsx` - Minor changes to adapt to the new type system
- `context/MatchContext.tsx` - Major refactoring to use cloud function
- `functions/src/index.ts` - Added new cloud function

## Future Improvements

Potential future enhancements:
- Add server-side pagination for matches with large user bases
- Implement advanced matching algorithms (e.g., ML-based)
- Add rate limiting and abuse prevention
- Optimize database queries for large-scale applications
- Add analytics tracking for match quality measurement 