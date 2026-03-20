import { NextResponse } from 'next/server';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

type SpotifyTrackDto = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; height: number | null; width: number | null }[];
  };
  preview_url: string | null;
  duration_ms: number;
  uri: string;
};

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
    const includeAll = Boolean(body?.includeAll);

    if (!playlistId) {
      return NextResponse.json({ error: 'playlistId is required' }, { status: 400 });
    }

    const accessToken = await getSpotifyAccessToken();
    const tracks: SpotifyTrackDto[] = [];
    let nextUrl = `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=100`;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to fetch playlist tracks' }, { status: response.status });
      }

      const data = await response.json();
      for (const item of data.items ?? []) {
        if (!item?.track?.id || !item?.track?.uri) continue;

        const track = {
          id: item.track.id,
          name: item.track.name,
          artists: (item.track.artists || []).map((a: { name: string }) => ({ name: a.name })),
          album: {
            name: item.track.album?.name,
            images: item.track.album?.images || [],
          },
          preview_url: item.track.preview_url || null,
          duration_ms: item.track.duration_ms,
          uri: item.track.uri,
        };

        if (includeAll || track.preview_url) {
          tracks.push(track);
        }
      }

      nextUrl = data.next;
    }

    return NextResponse.json({
      success: true,
      tracks,
      total: tracks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
