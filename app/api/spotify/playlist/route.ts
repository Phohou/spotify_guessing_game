import { NextResponse } from 'next/server';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

async function getSpotifyAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify server credentials are missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.');
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to get Spotify access token.');
  }

  const data = await response.json();
  return data.access_token as string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const playlistId = body?.playlistId as string | undefined;

    if (!playlistId) {
      return NextResponse.json({ error: 'playlistId is required' }, { status: 400 });
    }

    const accessToken = await getSpotifyAccessToken();

    const playlistResponse = await fetch(`${SPOTIFY_API_BASE}/playlists/${playlistId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!playlistResponse.ok) {
      if (playlistResponse.status === 404) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
      }
      if (playlistResponse.status === 401) {
        return NextResponse.json({ error: 'Spotify authentication failed' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Failed to fetch playlist' }, { status: playlistResponse.status });
    }

    const playlist = await playlistResponse.json();

    if (!playlist.public) {
      return NextResponse.json({ error: 'Playlist must be public' }, { status: 400 });
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
