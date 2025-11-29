'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import ProtectedRoute from '@/components/ProtectedRoute';
import Link from 'next/link';

interface LeaderboardEntry {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  score: number;
  playlistName: string;
  correctAnswers: number;
  totalQuestions: number;
  createdAt: any;
}

export default function LeaderboardPage() {
  return (
    <ProtectedRoute>
      <LeaderboardContent />
    </ProtectedRoute>
  );
}

function LeaderboardContent() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const leaderboardQuery = query(
        collection(db, 'gameSessions'),
        orderBy('score', 'desc'),
        limit(100)
      );
      const snapshot = await getDocs(leaderboardQuery);
      
      // Get user data for each entry
      const entriesData = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            userId: data.userId,
            userName: data.userName || 'Anonymous',
            userPhoto: data.userPhoto,
            score: data.score,
            playlistName: data.playlistName || 'Unknown Playlist',
            correctAnswers: data.correctAnswers,
            totalQuestions: data.totalQuestions,
            createdAt: data.createdAt,
          };
        })
      );

      setEntries(entriesData);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const userRank = entries.findIndex(e => e.userId === user?.uid) + 1;

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
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-bold text-white mb-4">🏆 Leaderboard</h1>
          <p className="text-white/90 text-lg">
            Top scores from all players
          </p>
          {userRank > 0 && (
            <p className="text-white font-semibold mt-4">
              Your Best Rank: #{userRank}
            </p>
          )}
        </div>

        {loading ? (
          <div className="text-center text-white py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <p className="mt-4">Loading leaderboard...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-12 text-center">
            <div className="text-6xl mb-4">🏆</div>
            <h3 className="text-2xl font-bold text-white mb-2">No scores yet</h3>
            <p className="text-[#b3b3b3] mb-6">
              Be the first to set a high score!
            </p>
            <Link
              href="/game"
              className="inline-block bg-[#1db954] text-white px-8 py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition"
            >
              Start Playing
            </Link>
          </div>
        ) : (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#b3b3b3] uppercase tracking-wider">
                      Rank
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#b3b3b3] uppercase tracking-wider">
                      Player
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#b3b3b3] uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#b3b3b3] uppercase tracking-wider">
                      Accuracy
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#b3b3b3] uppercase tracking-wider">
                      Playlist
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.map((entry, index) => (
                    <tr
                      key={entry.id}
                      className={`${
                        entry.userId === user?.uid ? 'bg-green-50' : ''
                      } hover:bg-gray-50 transition`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {index === 0 && <span className="text-2xl mr-2">🥇</span>}
                          {index === 1 && <span className="text-2xl mr-2">🥈</span>}
                          {index === 2 && <span className="text-2xl mr-2">🥉</span>}
                          <span className="text-sm font-medium text-white">
                            #{index + 1}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {entry.userPhoto ? (
                              <img
                                className="h-10 w-10 rounded-full"
                                src={entry.userPhoto}
                                alt={entry.userName}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-[#1db954] flex items-center justify-center text-white font-bold">
                                {entry.userName.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-white">
                              {entry.userName}
                              {entry.userId === user?.uid && (
                                <span className="ml-2 text-[#1db954]">(You)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-[#1db954]">
                          {entry.score}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {entry.correctAnswers}/{entry.totalQuestions}
                          <span className="text-[#b3b3b3] ml-1">
                            ({Math.round((entry.correctAnswers / entry.totalQuestions) * 100)}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-white truncate max-w-xs">
                          {entry.playlistName}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
