const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const spotifyPreviewFinder = require("spotify-preview-finder");

// Initialize Firebase Admin
admin.initializeApp();

// Cache for preview URLs to avoid redundant scraping
const previewUrlCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// Helper function to fetch preview URL with timeout
async function fetchPreviewWithTimeout(trackName, artistName, trackId, timeoutMs = 10000) {
  const cacheKey = `${trackId}`;
  
  // Check cache first
  const cached = previewUrlCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.info(`Using cached preview for track ${trackId}`);
    return cached.url;
  }
  
  // Create timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Timeout")), timeoutMs);
  });
  
  // Race between fetch and timeout
  try {
    const result = await Promise.race([
      spotifyPreviewFinder(trackName, artistName, 1),
      timeoutPromise,
    ]);
    
    if (result.success && result.results.length > 0 && result.results[0].previewUrls.length > 0) {
      const url = result.results[0].previewUrls[0];
      // Cache the result
      previewUrlCache.set(cacheKey, {url, timestamp: Date.now()});
      return url;
    }
    return null;
  } catch (err) {
    if (err.message === "Timeout") {
      logger.warn(`Timeout fetching preview for track ${trackId}`);
    }
    return null;
  }
}

// Helper function to batch process preview URL fetches with concurrency limit
async function batchFetchPreviews(tracksToFetch, concurrencyLimit = 5) {
  const results = [];
  
  for (let i = 0; i < tracksToFetch.length; i += concurrencyLimit) {
    const batch = tracksToFetch.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.allSettled(
        batch.map(async (track) => {
          const url = await fetchPreviewWithTimeout(track.name, track.artist, track.id);
          return {trackId: track.id, url};
        })
    );
    
    results.push(...batchResults.map((r) => r.status === "fulfilled" ? r.value : {trackId: null, url: null}));
  }
  
  return results;
}

setGlobalOptions({ maxInstances: 10 });

/**
 * Gets Spotify access token using Client Credentials flow
 */
async function getSpotifyAccessToken() {
  // Access secrets from environment (set via Firebase secrets)
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials not configured");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error("Failed to get Spotify access token");
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Fetches a Spotify playlist by ID
 * Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET secrets
 */
exports.getPlaylist = onCall({secrets: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"]}, async (request) => {
  try {
    const {playlistId} = request.data;

    if (!playlistId) {
      throw new Error("Playlist ID is required");
    }

    logger.info(`Fetching playlist with ID: ${playlistId}`);
    const accessToken = await getSpotifyAccessToken();

    // Fetch playlist details
    const playlistResponse = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}`,
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
          },
        },
    );

    if (!playlistResponse.ok) {
      const errorBody = await playlistResponse.text();
      logger.error(`Spotify API error: ${playlistResponse.status} - ${errorBody}`);
      if (playlistResponse.status === 404) {
        throw new Error("Playlist not found");
      }
      if (playlistResponse.status === 401) {
        throw new Error("Authentication failed with Spotify");
      }
      throw new Error(`Failed to fetch playlist: ${playlistResponse.status}`);
    }

    const playlist = await playlistResponse.json();

    // Check if playlist is public
    if (!playlist.public) {
      throw new Error("Playlist must be public");
    }

    // Format response
    return {
      success: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        images: playlist.images,
        owner: {
          display_name: playlist.owner.display_name,
          id: playlist.owner.id,
        },
        tracks: {
          total: playlist.tracks.total,
        },
        public: playlist.public,
        spotifyUrl: playlist.external_urls.spotify,
      },
    };
  } catch (error) {
    logger.error("Error fetching playlist:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", error.message || "Failed to fetch playlist");
  }
});

/**
 * Fetches all tracks from a Spotify playlist
 * Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET secrets
 */
exports.getPlaylistTracks = onCall({secrets: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"]}, async (request) => {
  try {
    const {playlistId, includeAll} = request.data;

    if (!playlistId) {
      throw new Error("Playlist ID is required");
    }

    const accessToken = await getSpotifyAccessToken();
    const tracks = [];
    let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

    // Fetch all tracks (handling pagination)
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch playlist tracks");
      }

      const data = await response.json();

      // Extract track info
      if (includeAll) {
        // For SDK mode, include all tracks immediately
        for (const item of data.items) {
          if (!item.track) continue;
          tracks.push({
            id: item.track.id,
            name: item.track.name,
            artists: item.track.artists.map((a) => ({name: a.name})),
            album: {
              name: item.track.album.name,
              images: item.track.album.images,
            },
            preview_url: item.track.preview_url || null,
            duration_ms: item.track.duration_ms,
            uri: item.track.uri,
          });
        }
      } else {
        // For preview mode, collect tracks and batch fetch missing previews
        const trackItems = [];
        const tracksNeedingPreview = [];
        
        for (const item of data.items) {
          if (!item.track) continue;
          
          const trackData = {
            id: item.track.id,
            name: item.track.name,
            artists: item.track.artists.map((a) => ({name: a.name})),
            album: {
              name: item.track.album.name,
              images: item.track.album.images,
            },
            preview_url: item.track.preview_url || null,
            duration_ms: item.track.duration_ms,
            uri: item.track.uri,
          };
          
          trackItems.push(trackData);
          
          // If no preview URL from Spotify, mark for batch fetching
          if (!trackData.preview_url || trackData.preview_url.trim() === "") {
            tracksNeedingPreview.push({
              id: item.track.id,
              name: item.track.name,
              artist: item.track.artists[0]?.name || "",
            });
          }
        }
        
        // Batch fetch missing preview URLs with concurrency limit
        if (tracksNeedingPreview.length > 0) {
          logger.info(`Batch fetching ${tracksNeedingPreview.length} missing preview URLs...`);
          const fetchedPreviews = await batchFetchPreviews(tracksNeedingPreview, 5);
          
          // Create a map for quick lookup
          const previewMap = new Map();
          fetchedPreviews.forEach((result) => {
            if (result.url) {
              previewMap.set(result.trackId, result.url);
            }
          });
          
          // Update track items with fetched preview URLs
          trackItems.forEach((trackData) => {
            if (previewMap.has(trackData.id)) {
              trackData.preview_url = previewMap.get(trackData.id);
            }
          });
        }
        
        // Only include tracks with valid preview URLs
        for (const trackData of trackItems) {
          if (trackData.preview_url && trackData.preview_url.trim() !== "") {
            tracks.push(trackData);
          }
        }
      }

      nextUrl = data.next;
    }

    const trackType = includeAll ? "tracks" : "tracks with previews";
    logger.info(`Fetched ${tracks.length} ${trackType} from playlist ${playlistId}`);

    if (tracks.length === 0 && !includeAll) {
      throw new HttpsError(
          "failed-precondition",
          "This playlist has no tracks with preview URLs available. Spotify only provides preview clips for some tracks (usually more popular songs). Try using Premium Mode for full track playback, or use a different playlist with mainstream songs."
      );
    }

    return {
      success: true,
      tracks,
      total: tracks.length,
    };
  } catch (error) {
    logger.error("Error fetching playlist tracks:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", error.message || "Failed to fetch playlist tracks");
  }
});

/**
 * Saves a game session to Firestore
 */
exports.saveGameSession = onCall(async (request) => {
  try {
    // Verify user is authenticated
    if (!request.auth) {
      throw new Error("User must be authenticated");
    }

    const {sessionData} = request.data;
    const userId = request.auth.uid;

    // Save to Firestore
    const docRef = await admin.firestore().collection("gameSessions").add({
      ...sessionData,
      userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update user stats
    const userRef = admin.firestore().collection("users").doc(userId);
    await userRef.set({
      totalGamesPlayed: admin.firestore.FieldValue.increment(1),
      totalScore: admin.firestore.FieldValue.increment(sessionData.score || 0),
      lastPlayedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    return {
      success: true,
      sessionId: docRef.id,
    };
  } catch (error) {
    logger.error("Error saving game session:", error);
    throw new Error(error.message || "Failed to save game session");
  }
});
