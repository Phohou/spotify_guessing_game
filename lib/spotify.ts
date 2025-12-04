// Spotify Web Playback SDK utilities

export const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ');

// PKCE helpers
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64encode(input: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export const getSpotifyAuthUrl = async () => {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  
  if (!clientId) {
    console.error('❌ NEXT_PUBLIC_SPOTIFY_CLIENT_ID is not set!');
    throw new Error('Spotify Client ID is not configured');
  }
  
  // Generate PKCE code verifier and challenge
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);
  
  // Store code verifier for token exchange
  localStorage.setItem('spotify_code_verifier', codeVerifier);
  
  // Spotify requires explicit loopback addresses (localhost not allowed)
  // Force 127.0.0.1 for local development
  let redirectUri: string;
  const hostname = window.location.hostname;
  const port = window.location.port || '3000';
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Always use 127.0.0.1 for local development
    redirectUri = `http://127.0.0.1:${port}/callback`;
  } else {
    // Production domain
    redirectUri = `${window.location.origin}/callback`;
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });
  
  const authUrl = `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;

  return authUrl;
};

export const getCodeFromUrl = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
};

export const exchangeCodeForToken = async (code: string): Promise<string> => {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  
  if (!codeVerifier) {
    throw new Error('Code verifier not found');
  }
  
  const hostname = window.location.hostname;
  const port = window.location.port || '3000';
  const redirectUri = (hostname === 'localhost' || hostname === '127.0.0.1')
    ? `http://127.0.0.1:${port}/callback`
    : `${window.location.origin}/callback`;
  
  let response;
  try {
    response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
  } catch (err) {
    console.error('Network error during token exchange:', err);
    throw new Error('Network error: Unable to connect to Spotify');
  }
  
  // Always read response as text first to handle non-JSON responses
  const responseText = await response.text();
  
  if (!response.ok) {
    let errorMessage = 'Failed to exchange code for token';
    try {
      const error = JSON.parse(responseText);
      errorMessage = error.error_description || error.error || errorMessage;
    } catch {
      // Response is not JSON, use raw text
      errorMessage = `Server error: ${responseText.substring(0, 200)}`;
    }
    
    throw new Error(errorMessage);
  }
  
  // Parse successful response
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (err) {
    console.error('Failed to parse token response:', responseText);
    throw new Error('Invalid response format from Spotify');
  }
  
  // Don't remove code verifier yet - callback page will handle it after storing token
  // This prevents race conditions where verifier is cleared before token exchange completes
  
  return data.access_token;
};

export interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, callback: (data: any) => void): void;
  removeListener(event: string): void;
  getCurrentState(): Promise<any>;
  setName(name: string): void;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
}

export const initializeSpotifyPlayer = (
  token: string,
  onReady: (deviceId: string) => void,
  onPlayerStateChanged: (state: any) => void
): Promise<SpotifyPlayer> => {
  return new Promise((resolve, reject) => {
    if (!window.Spotify) {
      reject(new Error('Spotify SDK not loaded'));
      return;
    }

    const player = new window.Spotify.Player({
      name: 'GuessTify Player',
      getOAuthToken: (cb: (token: string) => void) => {
        cb(token);
      },
      volume: 0.5,
    });

    // Error handling
    player.addListener('initialization_error', ({ message }: any) => {
      console.error('Initialization Error:', message);
      reject(new Error(message));
    });

    player.addListener('authentication_error', ({ message }: any) => {
      console.error('Authentication Error:', message);
      reject(new Error(message));
    });

    player.addListener('account_error', ({ message }: any) => {
      console.error('Account Error:', message);
      reject(new Error('Spotify Premium required'));
    });

    player.addListener('playback_error', ({ message }: any) => {
      console.error('Playback Error:', message);
    });

    // Ready
    player.addListener('ready', ({ device_id }: any) => {
      onReady(device_id);
      resolve(player);
    });

    // Not Ready
    player.addListener('not_ready', () => {
      // Device went offline
    });

    // Player state changes
    player.addListener('player_state_changed', (state: any) => {
      if (state) {
        onPlayerStateChanged(state);
      }
    });

    // Connect to the player
    player.connect();
  });
};

export const transferPlaybackToDevice = async (
  token: string,
  deviceId: string
): Promise<void> => {
  const response = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      device_ids: [deviceId],
      play: false,
    }),
  });

  if (!response.ok && response.status !== 404) {
    // Transfer failed, but we'll continue anyway
  }
};

export const playTrackAtPosition = async (
  token: string,
  deviceId: string,
  trackUri: string,
  positionMs: number = 0
): Promise<void> => {
  try {
    // First, start playing the track from the beginning
    const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        uris: [trackUri],
        position_ms: 0, // Start from beginning first
      }),
    });

    if (!playResponse.ok) {
      const errorText = await playResponse.text();
      console.error('Play error:', errorText);
      throw new Error(`Failed to play track: ${playResponse.status}`);
    }

    // Wait for the track to start loading (increased from 500ms for better reliability)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Then seek to the desired position if not at the beginning
    if (positionMs > 0) {
      const seekResponse = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!seekResponse.ok) {
        const errorText = await seekResponse.text();
        console.error('Seek error:', errorText);
        // Don't throw here, the track is still playing from the beginning
      }
    }
  } catch (error) {
    console.error('Error in playTrackAtPosition:', error);
    throw error;
  }
};

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}
