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
 * Generates a random number from a Gaussian (normal) distribution
 * Uses Box-Muller transform
 */
function gaussianRandom(mean: number = 0, stdev: number = 1): number {
  // Box–Muller transform
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return z * stdev + mean;
}

/**
 * Gets a Gaussian-distributed start time for track sampling
 * Picks a timestamp with 30 second sample length, favoring the middle of the track
 */
export function getGaussianStartTime(trackDuration: number, sampleLength: number = 30): number {
  const maxStart = trackDuration - sampleLength; // must fit
  const mean = trackDuration / 2;
  const stdev = trackDuration / 6;

  let t;

  // Retry until we land within bounds
  do {
    t = gaussianRandom(mean, stdev);
  } while (t < 0 || t > maxStart);

  return t;
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
 * Generates multiple choice options while completely avoiding previously used incorrect answers
 * Once a track is used as an incorrect option, it's removed from the pool
 */
export function generateSmartMultipleChoiceOptions(
  correctTrack: SpotifyTrack,
  allTracks: SpotifyTrack[],
  usedOptions: Set<string>,
  count: number = 4
): string[] {
  const options = new Set<string>();
  
  // CRITICAL: Always add the correct answer first
  options.add(correctTrack.name);
  
  // Get all other tracks (excluding the correct one AND any tracks used as incorrect options)
  const availableTracks = allTracks.filter(
    t => t.id !== correctTrack.id && !usedOptions.has(t.name)
  );
  
  // Shuffle for randomness
  const shuffled = shuffleArray(availableTracks);
  
  // Add tracks from the available pool (these have never been incorrect options)
  for (let i = 0; i < shuffled.length && options.size < count; i++) {
    options.add(shuffled[i].name);
  }
  
  // If we don't have enough tracks (very small playlist or late in game)
  // create decoys from artist names
  if (options.size < count) {
    const artists = allTracks.map(t => t.artists[0]?.name).filter(Boolean);
    const uniqueArtists = [...new Set(artists)];
    const shuffledArtists = shuffleArray(uniqueArtists);
    
    for (const artist of shuffledArtists) {
      if (options.size >= count) break;
      const decoy = `${artist} - Unknown Track`;
      if (!usedOptions.has(decoy) && decoy !== correctTrack.name) {
        options.add(decoy);
      }
    }
  }
  
  // CRITICAL: Verify correct answer is present
  const finalOptions = Array.from(options);
  if (!finalOptions.includes(correctTrack.name)) {
    console.error('CRITICAL ERROR: Correct answer not in options!');
    // Force add it if somehow missing
    finalOptions[0] = correctTrack.name;
  }
  
  // Final shuffle to randomize the display order
  const shuffledOptions = shuffleArray(finalOptions);
  
  return shuffledOptions;
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
