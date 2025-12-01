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
  
  console.log('🎵 Spotify Auth Details (PKCE):');
  console.log('  Client ID:', clientId);
  console.log('  Redirect URI:', redirectUri);
  console.log('  Current URL:', window.location.href);
  console.log('  Scopes:', SPOTIFY_SCOPES);
  console.log('⚠️  Make sure this EXACT redirect URI is added in Spotify Dashboard!');
  
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });
  
  const authUrl = `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
  console.log('🔗 Full Auth URL:', authUrl);

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
  
  console.log('Token Exchange Details:');
  console.log('  Client ID:', clientId);
  console.log('  Redirect URI:', redirectUri);
  console.log('  Code verifier exists:', !!codeVerifier);
  
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
    console.error('❌ Network error during token exchange:', err);
    throw new Error('Network error: Unable to connect to Spotify');
  }
  
  // Always read response as text first to handle non-JSON responses
  const responseText = await response.text();
  console.log('📥 Response status:', response.status, response.statusText);
  console.log('📥 Response preview:', responseText.substring(0, 200));
  
  if (!response.ok) {
    console.error('❌ Token exchange failed:');
    console.error('  Status:', response.status, response.statusText);
    console.error('  Full Response:', responseText);
    
    let errorMessage = 'Failed to exchange code for token';
    try {
      const error = JSON.parse(responseText);
      errorMessage = error.error_description || error.error || errorMessage;
      console.error('  Parsed Error:', error);
    } catch {
      // Response is not JSON, use raw text
      errorMessage = `Server error: ${responseText.substring(0, 200)}`;
      console.error('  Response was not JSON');
    }
    
    throw new Error(errorMessage);
  }
  
  // Parse successful response
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (err) {
    console.error('❌ Failed to parse success response:', responseText);
    throw new Error('Invalid response format from Spotify');
  }
  
  localStorage.removeItem('spotify_code_verifier');
  
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
      console.log('Ready with Device ID', device_id);
      onReady(device_id);
      resolve(player);
    });

    // Not Ready
    player.addListener('not_ready', ({ device_id }: any) => {
      console.log('Device ID has gone offline', device_id);
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
    console.error('Failed to transfer playback:', await response.text());
  }
};

export const playTrackAtPosition = async (
  token: string,
  deviceId: string,
  trackUri: string,
  positionMs: number = 0
): Promise<void> => {
  const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      uris: [trackUri],
      position_ms: positionMs,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to play track');
  }
};

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}
