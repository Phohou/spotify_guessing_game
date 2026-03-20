type PlaylistRequest = {
  playlistId: string;
};

type PlaylistTracksRequest = {
  playlistId: string;
  includeAll: boolean;
};

async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }

  return data as TResponse;
}

export async function fetchPlaylist(payload: PlaylistRequest) {
  return postJson<{ success: boolean; playlist: any }>('/api/spotify/playlist', payload);
}

export async function fetchPlaylistTracks(payload: PlaylistTracksRequest) {
  return postJson<{ success: boolean; tracks: any[]; total: number }>('/api/spotify/playlist-tracks', payload);
}
