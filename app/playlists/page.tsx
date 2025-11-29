'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import ProtectedRoute from '@/components/ProtectedRoute';
import Link from 'next/link';

interface SavedPlaylist {
  id: string;
  userId: string;
  userName: string;
  playlistId: string;
  playlistName: string;
  playlistImage?: string;
  trackCount: number;
  timesPlayed: number;
  addedAt: number;
}

export default function PlaylistsPage() {
  return (
    <ProtectedRoute>
      <PlaylistsContent />
    </ProtectedRoute>
  );
}

function PlaylistsContent() {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([]);
  const [myPlaylists, setMyPlaylists] = useState<SavedPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all');

  useEffect(() => {
    loadPlaylists();
  }, [user]);

  const loadPlaylists = async () => {
    if (!user) return;

    try {
      // Load all public playlists
      const allPlaylistsQuery = query(
        collection(db, 'savedPlaylists'),
        orderBy('timesPlayed', 'desc'),
        limit(50)
      );
      const allSnapshot = await getDocs(allPlaylistsQuery);
      const allData = allSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as SavedPlaylist[];
      setPlaylists(allData);

      // Load user's saved playlists
      const myPlaylistsQuery = query(
        collection(db, 'savedPlaylists'),
        where('userId', '==', user.uid),
        orderBy('addedAt', 'desc')
      );
      const mySnapshot = await getDocs(myPlaylistsQuery);
      const myData = mySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as SavedPlaylist[];
      setMyPlaylists(myData);
    } catch (error) {
      console.error('Error loading playlists:', error);
    } finally {
      setLoading(false);
    }
  };

  const displayedPlaylists = activeTab === 'all' ? playlists : myPlaylists;

  return (
    <div className="min-h-screen bg-[#121212]">
      <nav className="bg-[#212121] border-b border-[#535353]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold text-white">
              GuessTify
            </Link>
            <span className="text-white">{user?.displayName || user?.email}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Browse Playlists</h1>
          <p className="text-white/90 text-lg">
            Discover and play playlists shared by the community
          </p>
        </div>

        <div className="mb-6 flex gap-4">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              activeTab === 'all'
                ? 'bg-white text-[#1db954]'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            All Playlists ({playlists.length})
          </button>
          <button
            onClick={() => setActiveTab('my')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              activeTab === 'my'
                ? 'bg-white text-[#1db954]'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            My Playlists ({myPlaylists.length})
          </button>
        </div>

        {loading ? (
          <div className="text-center text-white py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <p className="mt-4">Loading playlists...</p>
          </div>
        ) : displayedPlaylists.length === 0 ? (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-12 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-2xl font-bold text-white mb-2">No playlists yet</h3>
            <p className="text-[#b3b3b3] mb-6">
              {activeTab === 'my'
                ? 'Start a game to save your first playlist!'
                : 'Be the first to share a playlist!'}
            </p>
            <Link
              href="/game"
              className="inline-block bg-[#1db954] text-white px-8 py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition"
            >
              Start New Game
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedPlaylists.map((playlist) => (
              <div
                key={playlist.id}
                className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition"
              >
                {playlist.playlistImage && (
                  <img
                    src={playlist.playlistImage}
                    alt={playlist.playlistName}
                    className="w-full h-48 object-cover rounded-lg mb-4"
                  />
                )}
                <h3 className="text-xl font-bold text-white mb-2 truncate">
                  {playlist.playlistName}
                </h3>
                <p className="text-[#b3b3b3] text-sm mb-4">
                  By {playlist.userName} • {playlist.trackCount} tracks
                </p>
                <div className="flex items-center justify-between text-sm text-[#b3b3b3] mb-4">
                  <span>🎮 Played {playlist.timesPlayed} times</span>
                </div>
                <a
                  href={`https://open.spotify.com/playlist/${playlist.playlistId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-[#1db954] text-white text-center py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition"
                >
                  Play on Spotify
                </a>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
