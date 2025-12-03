const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

// Initialize Firebase Admin
admin.initializeApp();

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
    throw new Error(error.message || "Failed to fetch playlist");
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
      for (const item of data.items) {
        // If includeAll is true (SDK mode), include all tracks
        // Otherwise (preview mode), only include tracks with preview URLs
        if (item.track && (includeAll || item.track.preview_url)) {
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
            uri: item.track.uri, // Add Spotify URI for SDK playback
          });
        }
      }

      nextUrl = data.next;
    }

    const trackType = includeAll ? "tracks" : "tracks with previews";
    logger.info(`Fetched ${tracks.length} ${trackType} from playlist ${playlistId}`);

    if (tracks.length === 0 && !includeAll) {
      throw new Error("This playlist has no tracks with 30-second preview URLs available. Spotify only provides previews for some tracks. Try using Premium Mode or a different playlist with more popular songs.");
    }

    return {
      success: true,
      tracks,
      total: tracks.length,
    };
  } catch (error) {
    logger.error("Error fetching playlist tracks:", error);
    throw new Error(error.message || "Failed to fetch playlist tracks");
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
