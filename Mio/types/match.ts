import { Timestamp } from "firebase/firestore";

// Match level types
export type MatchLevel = 'match' | 'superMatch';

// Match data structure shared between client and server
export interface MatchData {
  userId: string;
  displayName: string;
  profilePic: string;
  matchLevel: MatchLevel;
  favoriteShowIds: string[];
  matchTimestamp: Timestamp;
  age?: number | string;
  location?: string;
  gender?: string;
  chattingWith?: boolean; // Track if users are already in a conversation
}

// Response type from the cloud function
export interface SearchMatchesResponse {
  success: boolean;
  newMatches: MatchData[];
  matchCount: number;
  cooldownEnd: string;
  message: string;
} 