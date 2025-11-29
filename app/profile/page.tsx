'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import ProtectedRoute from '@/components/ProtectedRoute';
import Link from 'next/link';
import { UserProfile } from '@/lib/types';

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}

function ProfileContent() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      // Load user profile
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        setProfile(userDoc.data() as UserProfile);
      }

      // Load recent games
      const gamesQuery = query(
        collection(db, 'gameSessions'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const gamesSnapshot = await getDocs(gamesQuery);
      const gamesData = gamesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setRecentGames(gamesData);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212]">
        <div className="text-white text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          <p className="mt-4">Loading profile...</p>
        </div>
      </div>
    );
  }

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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8 mb-8">
          <div className="flex items-center gap-6 mb-8">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="w-24 h-24 rounded-full"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-[#1db954] flex items-center justify-center text-white text-4xl font-bold">
                {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-white">
                {user?.displayName || 'Player'}
              </h1>
              <p className="text-[#b3b3b3]">{user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-3xl font-bold text-[#1db954]">
                {profile?.totalGamesPlayed || 0}
              </div>
              <p className="text-sm text-[#b3b3b3]">Games Played</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-600">
                {profile?.totalScore || 0}
              </div>
              <p className="text-sm text-[#b3b3b3]">Total Score</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-3xl font-bold text-purple-600">
                {profile?.highScore || 0}
              </div>
              <p className="text-sm text-[#b3b3b3]">High Score</p>
            </div>
          </div>
        </div>

        <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Recent Games</h2>

          {recentGames.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[#b3b3b3] mb-4">No games played yet</p>
              <Link
                href="/game"
                className="inline-block bg-[#1db954] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition"
              >
                Start Your First Game
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {recentGames.map((game) => (
                <div
                  key={game.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-white mb-1">
                        {game.playlistName || 'Unknown Playlist'}
                      </h3>
                      <p className="text-sm text-[#b3b3b3]">
                        {game.correctAnswers}/{game.totalQuestions} correct •{' '}
                        {Math.round((game.correctAnswers / game.totalQuestions) * 100)}% accuracy
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-[#1db954]">
                        {game.score}
                      </div>
                      <p className="text-xs text-[#b3b3b3]">points</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
