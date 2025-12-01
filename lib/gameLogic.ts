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
 * Uses enhanced randomization to ensure different options each time
 */
export function generateMultipleChoiceOptions(
  correctTrack: SpotifyTrack,
  allTracks: SpotifyTrack[],
  count: number = 4
): string[] {
  const options = new Set<string>();
  options.add(correctTrack.name);
  
  // Get tracks that are NOT the correct track
  const otherTracks = allTracks.filter(t => t.id !== correctTrack.id);
  
  // Add extra randomization by shuffling multiple times
  let shuffled = shuffleArray(otherTracks);
  
  // Randomly select starting position to increase variety
  const startIndex = Math.floor(Math.random() * Math.max(1, shuffled.length - count));
  
  // Pick random tracks starting from random position
  for (let i = startIndex; i < shuffled.length && options.size < count; i++) {
    // Only add if the name is unique and different from correct answer
    if (shuffled[i].name !== correctTrack.name) {
      options.add(shuffled[i].name);
    }
  }
  
  // If still not enough, wrap around from beginning
  if (options.size < count) {
    for (let i = 0; i < startIndex && options.size < count; i++) {
      if (shuffled[i].name !== correctTrack.name) {
        options.add(shuffled[i].name);
      }
    }
  }
  
  // If we STILL don't have enough (small playlist), add artist-based decoys
  if (options.size < count) {
    const artists = allTracks.map(t => t.artists[0]?.name).filter(Boolean);
    const uniqueArtists = Array.from(new Set(artists));
    const shuffledArtists = shuffleArray(uniqueArtists);
    
    for (let i = 0; i < shuffledArtists.length && options.size < count; i++) {
      const decoy = `${shuffledArtists[i]} - Unknown Track`;
      if (decoy !== correctTrack.name) {
        options.add(decoy);
      }
    }
  }
  
  // Final shuffle to randomize the order of all options
  return shuffleArray(Array.from(options));
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
  console.log('Generating options for:', correctTrack.name);
  console.log('Used options count:', usedOptions.size);
  console.log('Total tracks available:', allTracks.length);
  
  const options = new Set<string>();
  
  // CRITICAL: Always add the correct answer first
  options.add(correctTrack.name);
  console.log('Correct answer added:', correctTrack.name);
  
  // Get all other tracks (excluding the correct one AND any tracks used as incorrect options)
  const availableTracks = allTracks.filter(
    t => t.id !== correctTrack.id && !usedOptions.has(t.name)
  );
  
  console.log('Available unused tracks:', availableTracks.length);
  
  // Shuffle for randomness
  const shuffled = shuffleArray(availableTracks);
  
  // Add tracks from the available pool (these have never been incorrect options)
  const neededCount = count - 1; // -1 because we already have the correct answer
  for (let i = 0; i < shuffled.length && options.size < count; i++) {
    options.add(shuffled[i].name);
    console.log('Added unused track:', shuffled[i].name);
  }
  
  // If we don't have enough tracks (very small playlist or late in game)
  // create decoys from artist names
  if (options.size < count) {
    console.log('Not enough unused tracks, creating artist decoys');
    const artists = allTracks.map(t => t.artists[0]?.name).filter(Boolean);
    const uniqueArtists = [...new Set(artists)];
    const shuffledArtists = shuffleArray(uniqueArtists);
    
    for (const artist of shuffledArtists) {
      if (options.size >= count) break;
      const decoy = `${artist} - Unknown Track`;
      if (!usedOptions.has(decoy) && decoy !== correctTrack.name) {
        options.add(decoy);
        console.log('Added artist decoy:', decoy);
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
  
  console.log('Final options:', shuffledOptions);
  console.log('Correct answer present:', shuffledOptions.includes(correctTrack.name));
  console.log('---');
  
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
