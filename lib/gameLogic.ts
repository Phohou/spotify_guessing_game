import { SpotifyTrack } from './types';

/**
 * Shuffles an array using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Selects a random start time for audio preview
 * Ensures we don't start too close to the end
 */
export function getRandomStartTime(durationMs: number, previewLength: number = 30000): number {
  const maxStartTime = Math.max(0, durationMs - previewLength);
  return Math.floor(Math.random() * maxStartTime);
}

/**
 * Filters tracks that have preview URLs available
 */
export function filterTracksWithPreviews(tracks: SpotifyTrack[]): SpotifyTrack[] {
  return tracks.filter(track => track.preview_url !== null);
}

/**
 * Calculates score based on time taken and difficulty
 */
export function calculateScore(
  isCorrect: boolean,
  timeToAnswer: number,
  maxTime: number = 30000
): number {
  if (!isCorrect) return 0;
  
  // Base score: 1000 points
  // Bonus for speed: up to 500 points (faster = more points)
  const baseScore = 1000;
  const speedBonus = Math.floor(500 * (1 - timeToAnswer / maxTime));
  
  return baseScore + speedBonus;
}

/**
 * Generates multiple choice options for a track
 */
export function generateMultipleChoiceOptions(
  correctTrack: SpotifyTrack,
  allTracks: SpotifyTrack[],
  count: number = 4
): string[] {
  const options = new Set<string>();
  options.add(correctTrack.name);
  
  // Get random incorrect options
  const otherTracks = allTracks.filter(t => t.id !== correctTrack.id);
  const shuffled = shuffleArray(otherTracks);
  
  for (let i = 0; i < shuffled.length && options.size < count; i++) {
    options.add(shuffled[i].name);
  }
  
  // If we don't have enough tracks, add some artist names as decoys
  if (options.size < count) {
    const artists = allTracks.map(t => t.artists[0]?.name).filter(Boolean);
    const shuffledArtists = shuffleArray(artists);
    for (let i = 0; i < shuffledArtists.length && options.size < count; i++) {
      options.add(`${shuffledArtists[i]} - Unknown Track`);
    }
  }
  
  return shuffleArray(Array.from(options));
}

/**
 * Parses Spotify playlist URL to extract playlist ID
 */
export function extractPlaylistId(url: string): string | null {
  try {
    // Handle various Spotify URL formats
    const patterns = [
      /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
      /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    // If it's already just an ID
    if (/^[a-zA-Z0-9]+$/.test(url)) return url;
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Validates if a string is a valid Spotify playlist URL or ID
 */
export function isValidPlaylistUrl(input: string): boolean {
  return extractPlaylistId(input) !== null;
}

/**
 * Formats time in milliseconds to MM:SS
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Calculates accuracy percentage
 */
export function calculateAccuracy(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}
