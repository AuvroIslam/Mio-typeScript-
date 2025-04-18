import { getFunctions, httpsCallable, HttpsCallableResult } from "firebase/functions";

/**
 * Utility to fetch data from TMDB API via Firebase Cloud Function
 * This protects our TMDB API key by keeping it server-side
 */

// --- Define Interfaces for TMDB Responses ---

// Common structure for a TV show item in lists
export interface TMDBShowListItem {
  id: number;
  name: string;
  poster_path: string | null;
  overview: string;
  genre_ids?: number[];
  original_language?: string;
  origin_country?: string[];
  vote_average?: number;
  first_air_date?: string;
}

// Response for search/trending/popular/top_rated lists
export interface TMDBListResponse<T = TMDBShowListItem> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// Response for get show details
export interface TMDBShowDetails {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  genres?: { id: number; name: string }[];
  original_language?: string;
  origin_country?: string[];
  vote_average?: number;
  first_air_date?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  status?: string;
  created_by?: any[]; // Consider defining type if needed
  networks?: any[]; // Consider defining type if needed
  similar?: TMDBListResponse<TMDBShowListItem>; // If appended
}

// --- Type the fetchTMDB function ---

export const fetchTMDB = async <T = any>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<T> => {
  try {
    const functions = getFunctions();
    // Explicitly type the callable function
    const getTMDBData = httpsCallable<
      { endpoint: string; params: Record<string, any> }, // Input type
      T // Expected return data type
    >(functions, 'getTMDBData');

    // The result from httpsCallable is HttpsCallableResult<T>
    const result: HttpsCallableResult<T> = await getTMDBData({
      endpoint,
      params,
    });

    // Extract the data property
    return result.data;
  } catch (error) {
    console.error('Error fetching TMDB data via Cloud Function:', error);
    // Improve error handling if needed, e.g., check error type
    throw error; // Re-throw the error so callers can handle it
  }
};

// --- Type the specific API methods ---

export const tmdbApi = {
  searchShows: (query: string, page = 1): Promise<TMDBListResponse<TMDBShowListItem>> =>
    fetchTMDB<TMDBListResponse<TMDBShowListItem>>('/search/tv', { query, page }),

  getTrending: (timeWindow: 'day' | 'week' = 'week', page = 1): Promise<TMDBListResponse<TMDBShowListItem>> =>
    fetchTMDB<TMDBListResponse<TMDBShowListItem>>(`/trending/tv/${timeWindow}`, { page }),

  // Make sure append_to_response matches what you need in getShowDetails calls
  getShowDetails: (showId: number): Promise<TMDBShowDetails> =>
    fetchTMDB<TMDBShowDetails>(`/tv/${showId}`, { append_to_response: 'similar' }),

  getPopular: (page = 1): Promise<TMDBListResponse<TMDBShowListItem>> =>
    fetchTMDB<TMDBListResponse<TMDBShowListItem>>('/tv/popular', { page }),

  getTopRated: (page = 1): Promise<TMDBListResponse<TMDBShowListItem>> =>
    fetchTMDB<TMDBListResponse<TMDBShowListItem>>('/tv/top_rated', { page }),
};

export default tmdbApi; 