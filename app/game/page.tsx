'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/hooks';
import { functions, db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import {
  extractPlaylistId,
  isValidPlaylistUrl,
  shuffleArray,
  generateMultipleChoiceOptions,
  calculateScore,
  filterTracksWithPreviews,
} from '@/lib/gameLogic';
import { SpotifyTrack, GameAnswer } from '@/lib/types';
import ProtectedRoute from '@/components/ProtectedRoute';
import Link from 'next/link';
import { getSpotifyAuthUrl, initializeSpotifyPlayer, playTrackAtPosition, SpotifyPlayer } from '@/lib/spotify';
import { Music2, Play, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GamePage() {
  return (
    <ProtectedRoute>
      <GameContent />
    </ProtectedRoute>
  );
}

function GameContent() {
  const { user } = useAuth();
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);

  // Game states
  const [gameState, setGameState] = useState<'setup' | 'loading' | 'playing' | 'results'>('setup');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistInfo, setPlaylistInfo] = useState<any>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const [score, setScore] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [options, setOptions] = useState<string[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Spotify SDK states
  const [playbackMode, setPlaybackMode] = useState<'preview' | 'sdk'>('preview');
  const [spotifyPlayer, setSpotifyPlayer] = useState<SpotifyPlayer | null>(null);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const currentTrack = tracks[currentTrackIndex];

  // Initialize Spotify SDK
  useEffect(() => {
    // Check for stored Spotify token
    const token = localStorage.getItem('spotify_access_token');
    if (token) {
      setSpotifyToken(token);
    }

    // Wait for Spotify SDK to be ready via the global callback
    const handleSpotifyReady = () => {
      setSdkReady(true);
    };

    if ((window as any).spotifyReady) {
      setSdkReady(true);
    } else {
      window.addEventListener('spotify-ready', handleSpotifyReady);
    }

    return () => {
      window.removeEventListener('spotify-ready', handleSpotifyReady);
    };
  }, []);

  // Initialize Spotify Player when token is available
  useEffect(() => {
    if (spotifyToken && sdkReady && !spotifyPlayer && playbackMode === 'sdk') {
      initializeSpotifyPlayer(
        spotifyToken,
        (deviceId) => {
          console.log('Spotify device ready:', deviceId);
          setSpotifyDeviceId(deviceId);
        },
        (state) => {
          console.log('Player state changed:', state);
        }
      )
        .then((player) => {
          setSpotifyPlayer(player);
        })
        .catch((err) => {
          console.error('Failed to initialize Spotify player:', err);
          // Clear invalid token and reset state
          localStorage.removeItem('spotify_access_token');
          setSpotifyToken(null);
          setSpotifyPlayer(null);
          setError('Spotify Premium required for SDK playback. Please use Preview Mode or connect a Premium account.');
        });
    }
  }, [spotifyToken, sdkReady, spotifyPlayer, playbackMode]);

  const handleSpotifyAuth = async () => {
    try {
      const authUrl = await getSpotifyAuthUrl();
      console.log('Redirecting to Spotify auth...');
      window.location.href = authUrl;
    } catch (error) {
      console.error('Failed to initiate Spotify auth:', error);
      setError(error instanceof Error ? error.message : 'Failed to connect to Spotify');
    }
  };

  const loadPlaylist = async () => {
    setError('');
    setLoading(true);

    try {
      const playlistId = extractPlaylistId(playlistUrl);
      if (!playlistId) {
        setError('Invalid Spotify playlist URL');
        setLoading(false);
        return;
      }

      // Call Firebase Function to get playlist
      const getPlaylist = httpsCallable(functions, 'getPlaylist');
      const playlistResult = await getPlaylist({ playlistId });
      const playlistData: any = playlistResult.data;

      if (!playlistData.success) {
        setError('Failed to load playlist');
        setLoading(false);
        return;
      }

      setPlaylistInfo(playlistData.playlist);

      // Get playlist tracks
      const getTracks = httpsCallable(functions, 'getPlaylistTracks');
      const tracksResult = await getTracks({ playlistId, includeAll: playbackMode === 'sdk' });
      const tracksData: any = tracksResult.data;

      if (!tracksData.success || tracksData.tracks.length === 0) {
        setError('No tracks found in playlist');
        setLoading(false);
        return;
      }

      let playableTracks = tracksData.tracks as SpotifyTrack[];

      // In preview mode, filter for tracks with preview URLs
      if (playbackMode === 'preview') {
        playableTracks = filterTracksWithPreviews(tracksData.tracks);
        if (playableTracks.length < 4) {
          setError('Playlist needs at least 4 tracks with preview URLs. Try using Spotify Premium mode or a different playlist.');
          setLoading(false);
          return;
        }
      } else {
        // SDK mode - all tracks are playable
        if (playableTracks.length < 4) {
          setError('Playlist needs at least 4 tracks');
          setLoading(false);
          return;
        }
      }

      const shuffled = shuffleArray(playableTracks);
      const gameTracks = shuffled.slice(0, Math.min(totalQuestions, shuffled.length));

      setTracks(gameTracks);
      setGameState('playing');
      setStartTime(Date.now());
      setQuestionStartTime(Date.now());
      await prepareQuestion(0, gameTracks);
    } catch (err: any) {
      console.error('Error loading playlist:', err);
      setError(err.message || 'Failed to load playlist');
    } finally {
      setLoading(false);
    }
  };

  const prepareQuestion = async (index: number, trackList: SpotifyTrack[]) => {
    const track = trackList[index];
    const allOptions = generateMultipleChoiceOptions(track, trackList, 4);
    setOptions(allOptions);
    setSelectedAnswer(null);
    setShowAnswer(false);
    setQuestionStartTime(Date.now());

    // Play audio based on mode
    if (playbackMode === 'sdk' && spotifyToken && spotifyDeviceId && track.uri) {
      try {
        // Random position between 30 seconds and 60 seconds before the end
        const randomPosition = Math.floor(Math.random() * (track.duration_ms - 60000)) + 30000;
        await playTrackAtPosition(spotifyToken, spotifyDeviceId, track.uri, randomPosition);
      } catch (error) {
        console.error('Failed to play track via SDK:', error);
      }
    }
  };

  const handleAnswer = (answer: string) => {
    if (showAnswer) return;

    setSelectedAnswer(answer);
    setShowAnswer(true);

    const timeToAnswer = Date.now() - questionStartTime;
    const isCorrect = answer === currentTrack.name;
    const points = calculateScore(isCorrect, timeToAnswer);

    const gameAnswer: GameAnswer = {
      trackId: currentTrack.id,
      correctAnswer: currentTrack.name,
      userAnswer: answer,
      isCorrect,
      timeToAnswer,
    };

    setAnswers([...answers, gameAnswer]);
    if (isCorrect) {
      setScore(score + points);
    }

    // Pause audio
    if (playbackMode === 'preview' && audioRef.current) {
      audioRef.current.pause();
    } else if (playbackMode === 'sdk' && spotifyPlayer) {
      spotifyPlayer.pause();
    }
  };

  const nextQuestion = async () => {
    if (currentTrackIndex + 1 < tracks.length) {
      const nextIndex = currentTrackIndex + 1;
      setCurrentTrackIndex(nextIndex);
      await prepareQuestion(nextIndex, tracks);
    } else {
      finishGame();
    }
  };

  const finishGame = async () => {
    setGameState('results');

    // Pause playback
    if (playbackMode === 'preview' && audioRef.current) {
      audioRef.current.pause();
    } else if (playbackMode === 'sdk' && spotifyPlayer) {
      spotifyPlayer.pause();
    }

    // Save game session to Firestore
    try {
      await addDoc(collection(db, 'gameSessions'), {
        userId: user?.uid,
        userName: user?.displayName || user?.email || 'Anonymous',
        userPhoto: user?.photoURL,
        playlistId: playlistInfo.id,
        playlistName: playlistInfo.name,
        score,
        totalQuestions: tracks.length,
        correctAnswers: answers.filter(a => a.isCorrect).length,
        answers,
        startTime,
        endTime: Date.now(),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error saving game session:', err);
    }
  };

  const resetGame = () => {
    setGameState('setup');
    setPlaylistUrl('');
    setPlaylistInfo(null);
    setTracks([]);
    setCurrentTrackIndex(0);
    setSelectedAnswer(null);
    setAnswers([]);
    setScore(0);
    setOptions([]);
    setShowAnswer(false);
    setError('');
  };

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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {gameState === 'setup' && (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8">
            <h2 className="text-3xl font-bold text-white mb-6">Start New Game</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            {/* Playback Mode Selection */}
            <div className="mb-6 p-4 bg-[#121212] rounded-lg border border-[#535353]">
              <label className="block text-sm font-medium text-[#b3b3b3] mb-3">
                Playback Mode
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setPlaybackMode('preview')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    playbackMode === 'preview'
                      ? 'border-[#1db954] bg-[#1db954]/10'
                      : 'border-[#535353] hover:border-[#1db954]/50'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Volume2 className={`w-6 h-6 ${playbackMode === 'preview' ? 'text-[#1db954]' : 'text-[#b3b3b3]'}`} />
                    <h3 className="text-lg font-semibold text-white">Preview Mode</h3>
                  </div>
                  <p className="text-sm text-[#b3b3b3] text-left">
                    Uses 30-second Spotify previews. No account needed, but limited to songs with previews.
                  </p>
                </button>

                <div
                  onClick={() => {
                    if (!spotifyToken) {
                      handleSpotifyAuth();
                    } else {
                      setPlaybackMode('sdk');
                    }
                  }}
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    playbackMode === 'sdk'
                      ? 'border-[#1db954] bg-[#1db954]/10'
                      : 'border-[#535353] hover:border-[#1db954]/50'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Music2 className={`w-6 h-6 ${playbackMode === 'sdk' ? 'text-[#1db954]' : 'text-[#b3b3b3]'}`} />
                    <h3 className="text-lg font-semibold text-white">
                      Premium Mode {spotifyToken && '✓'}
                    </h3>
                  </div>
                  <p className="text-sm text-[#b3b3b3] text-left">
                    Full Spotify playback. Requires Premium account. Works with all songs.
                  </p>
                  {!spotifyToken && (
                    <div className="mt-2 w-full bg-[#1db954] hover:bg-[#1ed760] text-white py-2 px-4 rounded text-center text-sm font-medium">
                      Connect Spotify
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#b3b3b3] mb-2">
                  Spotify Playlist URL
                </label>
                <input
                  type="text"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/..."
                  className="w-full px-4 py-3 border border-[#535353] bg-[#121212] text-white rounded-lg focus:ring-2 focus:ring-[#1db954] focus:border-transparent outline-none"
                />
                <p className="mt-2 text-sm text-[#b3b3b3]">
                  Paste a public Spotify playlist URL
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#b3b3b3] mb-2">
                  Number of Questions
                </label>
                <select
                  value={totalQuestions}
                  onChange={(e) => setTotalQuestions(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-[#535353] bg-[#121212] text-white rounded-lg focus:ring-2 focus:ring-[#1db954] focus:border-transparent outline-none"
                >
                  <option value={5}>5 Questions</option>
                  <option value={10}>10 Questions</option>
                  <option value={15}>15 Questions</option>
                  <option value={20}>20 Questions</option>
                </select>
              </div>

              <button
                onClick={loadPlaylist}
                disabled={!isValidPlaylistUrl(playlistUrl) || loading}
                className="w-full bg-[#1db954] text-white py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading Playlist...' : 'Start Game'}
              </button>
            </div>
          </div>
        )}

        {gameState === 'playing' && currentTrack && (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8">
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[#b3b3b3] font-medium">
                  Question {currentTrackIndex + 1} of {tracks.length}
                </span>
                <span className="text-2xl font-bold text-[#1db954]">
                  Score: {score}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-[#1db954] h-2 rounded-full transition-all"
                  style={{ width: `${((currentTrackIndex + 1) / tracks.length) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                What song is this?
              </h2>

              {/* Audio playback - either preview URL or SDK */}
              {playbackMode === 'preview' && currentTrack.preview_url && (
                <audio
                  ref={audioRef}
                  src={currentTrack.preview_url}
                  autoPlay
                  controls
                  className="w-full mb-4"
                />
              )}

              {playbackMode === 'sdk' && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Volume2 className="w-5 h-5 text-[#1db954]" />
                  <span className="text-[#b3b3b3]">Playing via Spotify</span>
                </div>
              )}

              {showAnswer && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-lg font-semibold">
                    {selectedAnswer === currentTrack.name ? '✅ Correct!' : '❌ Incorrect'}
                  </p>
                  <p className="text-[#b3b3b3] mt-2">
                    <strong>{currentTrack.name}</strong> by {currentTrack.artists.map(a => a.name).join(', ')}
                  </p>
                  {currentTrack.album.images[0] && (
                    <img
                      src={currentTrack.album.images[0].url}
                      alt={currentTrack.album.name}
                      className="w-32 h-32 mx-auto mt-4 rounded-lg shadow"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleAnswer(option)}
                  disabled={showAnswer}
                  className={`p-4 rounded-lg font-medium transition ${
                    showAnswer
                      ? option === currentTrack.name
                        ? 'bg-green-100 border-2 border-green-600 text-green-800'
                        : option === selectedAnswer
                        ? 'bg-red-100 border-2 border-red-600 text-red-800'
                        : 'bg-gray-100 text-[#b3b3b3]'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-gray-200 hover:border-green-500'
                  } ${showAnswer ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {option}
                </button>
              ))}
            </div>

            {showAnswer && (
              <button
                onClick={nextQuestion}
                className="w-full mt-6 bg-[#1db954] text-white py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition"
              >
                {currentTrackIndex + 1 < tracks.length ? 'Next Question' : 'See Results'}
              </button>
            )}
          </div>
        )}

        {gameState === 'results' && (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8 text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Game Over! 🎉</h2>
            
            <div className="mb-8">
              <div className="text-6xl font-bold text-[#1db954] mb-2">{score}</div>
              <p className="text-[#b3b3b3]">Total Score</p>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-[#1db954]">
                  {answers.filter(a => a.isCorrect).length}
                </div>
                <p className="text-sm text-[#b3b3b3]">Correct</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <div className="text-3xl font-bold text-red-600">
                  {answers.filter(a => !a.isCorrect).length}
                </div>
                <p className="text-sm text-[#b3b3b3]">Incorrect</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-3xl font-bold text-blue-600">
                  {Math.round((answers.filter(a => a.isCorrect).length / answers.length) * 100)}%
                </div>
                <p className="text-sm text-[#b3b3b3]">Accuracy</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={resetGame}
                className="w-full bg-[#1db954] text-white py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition"
              >
                Play Again
              </button>
              <Link
                href="/"
                className="block w-full bg-gray-200 text-[#b3b3b3] py-3 rounded-lg font-semibold hover:bg-gray-300 transition"
              >
                Back to Home
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
