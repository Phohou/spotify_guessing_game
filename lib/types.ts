export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
  preview_url: string | null;
  duration_ms: number;
  uri?: string; // Spotify URI for SDK playback
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  owner: {
    display_name: string;
    id: string;
  };
  tracks: {
    total: number;
  };
  public: boolean;
  spotifyUrl: string;
}

export interface GameSession {
  id: string;
  userId: string;
  playlistId: string;
  tracks: SpotifyTrack[];
  currentTrackIndex: number;
  score: number;
  totalQuestions: number;
  startTime: number;
  endTime?: number;
  answers: GameAnswer[];
}

export interface GameAnswer {
  trackId: string;
  correctAnswer: string;
  userAnswer: string;
  isCorrect: boolean;
  timeToAnswer: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: number;
  totalGamesPlayed: number;
  totalScore: number;
  highScore: number;
  savedPlaylists: string[];
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  photoURL?: string;
  score: number;
  playlistName: string;
  timestamp: number;
}

export interface SavedPlaylist {
  id: string;
  userId: string;
  spotifyPlaylistId: string;
  playlistName: string;
  playlistImage: string;
  trackCount: number;
  addedAt: number;
  isPublic: boolean;
  timesPlayed: number;
}
