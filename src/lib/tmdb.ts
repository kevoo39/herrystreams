const TMDB_API_KEY = '3a7bdac2beac962ee146642e8d161275';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  genre_ids: number[];
  adult: boolean;
  original_language: string;
  popularity: number;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  overview: string;
  first_air_date: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  genre_ids: number[];
}

export interface TMDBMovieDetails extends TMDBMovie {
  runtime: number;
  genres: { id: number; name: string }[];
  credits?: {
    cast: { id: number; name: string; character: string; profile_path: string }[];
  };
  videos?: {
    results: { id: string; key: string; name: string; type: string; site: string }[];
  };
}

export interface TMDBTVShowDetails extends TMDBTVShow {
  seasons: { id: number; season_number: number; name: string; episode_count: number; poster_path: string }[];
  number_of_seasons: number;
  genres: { id: number; name: string }[];
  credits?: {
    cast: { id: number; name: string; character: string; profile_path: string }[];
  };
  videos?: {
    results: { id: string; key: string; name: string; type: string; site: string }[];
  };
}

export interface TMDBEpisode {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  air_date: string;
  runtime: number;
  still_path: string;
  vote_average: number;
}

class TMDBService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000;

  private async fetchFromTMDB(endpoint: string) {
    const cached = this.cache.get(endpoint);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) return cached.data;

    const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB API error: ${response.statusText}`);
    const data = await response.json();
    this.cache.set(endpoint, { data, timestamp: Date.now() });
    if (this.cache.size > 100) {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.CACHE_DURATION) this.cache.delete(key);
      }
    }
    return data;
  }

  async getTrendingMovies(): Promise<TMDBMovie[]> {
    return (await this.fetchFromTMDB('/trending/movie/week')).results;
  }

  async getPopularMovies(): Promise<TMDBMovie[]> {
    return (await this.fetchFromTMDB('/movie/popular')).results;
  }

  async getTopRatedMovies(): Promise<TMDBMovie[]> {
    return (await this.fetchFromTMDB('/movie/top_rated')).results;
  }

  async getNowPlayingMovies(): Promise<TMDBMovie[]> {
    return (await this.fetchFromTMDB('/movie/now_playing')).results;
  }

  async getUpcomingMovies(): Promise<TMDBMovie[]> {
    return (await this.fetchFromTMDB('/movie/upcoming')).results;
  }

  async getMovieDetails(id: number): Promise<TMDBMovieDetails> {
    return this.fetchFromTMDB(`/movie/${id}?append_to_response=credits,videos`);
  }

  async getSimilarMovies(id: string): Promise<TMDBMovie[]> {
    return (await this.fetchFromTMDB(`/movie/${id}/similar`)).results;
  }

  async searchMovies(query: string): Promise<TMDBMovie[]> {
    return (await this.fetchFromTMDB(`/search/movie?query=${encodeURIComponent(query)}`)).results;
  }

  async searchTVShows(query: string): Promise<TMDBTVShow[]> {
    return (await this.fetchFromTMDB(`/search/tv?query=${encodeURIComponent(query)}`)).results;
  }

  async getTrendingTVShows(): Promise<TMDBTVShow[]> {
    return (await this.fetchFromTMDB('/trending/tv/week')).results;
  }

  async getPopularTVShows(): Promise<TMDBTVShow[]> {
    return (await this.fetchFromTMDB('/tv/popular')).results;
  }

  async getTVShowDetails(id: number): Promise<TMDBTVShowDetails> {
    return this.fetchFromTMDB(`/tv/${id}?append_to_response=credits,videos`);
  }

  async getSeasonDetails(tvId: number, seasonNumber: number): Promise<{ episodes: TMDBEpisode[] }> {
    return this.fetchFromTMDB(`/tv/${tvId}/season/${seasonNumber}`);
  }

  async getSimilarTVShows(id: string): Promise<TMDBTVShow[]> {
    return (await this.fetchFromTMDB(`/tv/${id}/similar`)).results;
  }

  async getGenres(): Promise<{ id: number; name: string }[]> {
    return (await this.fetchFromTMDB('/genre/movie/list')).genres;
  }

  async discoverMovies(params: { genre?: number; sortBy?: string }): Promise<TMDBMovie[]> {
    let endpoint = '/discover/movie?';
    if (params.genre) endpoint += `with_genres=${params.genre}&`;
    if (params.sortBy) endpoint += `sort_by=${params.sortBy}&`;
    return (await this.fetchFromTMDB(endpoint)).results;
  }

  getImageUrl(path: string): string {
    if (!path) return '';
    return `https://image.tmdb.org/t/p/w342${path}`;
  }

  getBackdropUrl(path: string): string {
    if (!path) return '';
    return `https://image.tmdb.org/t/p/w1280${path}`;
  }

  getPosterUrl(path: string): string {
    if (!path) return '';
    return `https://image.tmdb.org/t/p/w500${path}`;
  }
}

export const tmdbService = new TMDBService();
