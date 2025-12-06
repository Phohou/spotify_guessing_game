'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/hooks';
import { functions, db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { 
  collection, 
  addDoc, 
  doc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp, 
  arrayUnion, 
  arrayRemove,
  deleteDoc,
  query,
  where,
  getDocs,
  increment,
  setDoc
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import {
  extractPlaylistId,
  isValidPlaylistUrl,
  shuffleArray,
  generateSmartMultipleChoiceOptions,
  calculateScore,
  filterTracksWithPreviews,
  getGaussianStartTime,
} from '@/lib/gameLogic';
import { SpotifyTrack, GameAnswer } from '@/lib/types';
import ProtectedRoute from '@/components/ProtectedRoute';
import Link from 'next/link';
import { Users, Copy, Check, Crown, Trophy, Music2, Volume2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSpotifyAuthUrl, initializeSpotifyPlayer, playTrackAtPosition, transferPlaybackToDevice, SpotifyPlayer } from '@/lib/spotify';

interface Player {
  uid: string;
  displayName: string;
  photoURL: string;
  score: number;
  answers: GameAnswer[];
  isReady: boolean;
}

interface Lobby {
  id: string;
  hostId: string;
  players: Player[];
  playlistUrl: string;
  playlistInfo: any;
  status: 'waiting' | 'playing' | 'finished';
  currentTrackIndex: number;
  tracks: SpotifyTrack[];
  totalQuestions: number;
  createdAt: any;
  startedAt?: any;
  playbackMode: 'preview' | 'sdk';
  startPositions?: number[]; // Pre-calculated start positions (in ms) for each track
}

export default function MultiplayerPage() {
  return (
    <ProtectedRoute>
      <MultiplayerContent />
    </ProtectedRoute>
  );
}

function MultiplayerContent() {
  const { user } = useAuth();
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);

  // Lobby states
  const [view, setView] = useState<'menu' | 'create' | 'join' | 'lobby' | 'playing' | 'results'>('menu');
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [lobbyId, setLobbyId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [availableLobbies, setAvailableLobbies] = useState<Lobby[]>([]);

  // Game setup states
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [playbackMode, setPlaybackMode] = useState<'preview' | 'sdk'>('preview');
  const [fullPlaylist, setFullPlaylist] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Game playing states
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [maxTime, setMaxTime] = useState(30);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [volume, setVolume] = useState(0.15);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Spotify SDK states
  const [spotifyPlayer, setSpotifyPlayer] = useState<SpotifyPlayer | null>(null);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkConnecting, setSdkConnecting] = useState(false);

  const isHost = lobby?.hostId === user?.uid;
  const currentPlayer = lobby?.players.find(p => p.uid === user?.uid);

  // Check for Spotify token on mount
  useEffect(() => {
    const token = localStorage.getItem('spotify_access_token');
    if (token) {
      setSpotifyToken(token);
    }

    // Check if player and device already exist globally
    const existingPlayer = (window as any).__spotifyPlayer;
    const existingDeviceId = (window as any).__spotifyDeviceId;
    
    if (existingPlayer && existingDeviceId) {
      setSpotifyPlayer(existingPlayer);
      setSpotifyDeviceId(existingDeviceId);
    }

    // Wait for Spotify SDK to be ready
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
    if (spotifyToken && sdkReady && !spotifyPlayer && lobby?.playbackMode === 'sdk') {
      // Check if player already exists globally first
      const existingPlayer = (window as any).__spotifyPlayer;
      const existingDeviceId = (window as any).__spotifyDeviceId;
      
      if (existingPlayer && existingDeviceId) {
        setSpotifyPlayer(existingPlayer);
        setSpotifyDeviceId(existingDeviceId);
        return;
      }
      
      initializeSpotifyPlayer(
        spotifyToken,
        (deviceId) => {
          setSpotifyDeviceId(deviceId);
          (window as any).__spotifyDeviceId = deviceId;
        },
        () => {}
      )
        .then((player) => {
          setSpotifyPlayer(player);
          (window as any).__spotifyPlayer = player;
        })
        .catch((err) => {
          console.error('Failed to initialize Spotify player:', err);
          localStorage.removeItem('spotify_access_token');
          setSpotifyToken(null);
          setSpotifyPlayer(null);
          delete (window as any).__spotifyPlayer;
          delete (window as any).__spotifyDeviceId;
          setError('Spotify Premium required for SDK playback. Please use Preview Mode or connect a Premium account.');
        });
    }
  }, [spotifyToken, sdkReady, spotifyPlayer, lobby?.playbackMode]);

  // Volume control
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    
    // Control SDK volume
    if (spotifyPlayer && lobby?.playbackMode === 'sdk') {
      spotifyPlayer.setVolume(volume).catch(err => {
        console.error('Failed to set volume:', err);
      });
    }
  }, [volume, spotifyPlayer, lobby?.playbackMode]);

  // Timer effect
  useEffect(() => {
    if (view === 'playing' && !showAnswer && currentTrack) {
      setTimeRemaining(maxTime);
      
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            handleTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [view, showAnswer, currentTrack, maxTime]);

  // Listen to lobby changes
  useEffect(() => {
    if (!lobbyId || !user) return;

    let previousTrackIndex: number | null = null;

    const unsubscribe = onSnapshot(doc(db, 'lobbies', lobbyId), (snapshot) => {
      if (!snapshot.exists()) {
        setError('Lobby not found');
        setView('menu');
        setLobbyId('');
        return;
      }

      const lobbyData = { id: snapshot.id, ...snapshot.data() } as Lobby;
      setLobby(lobbyData);

      // Check if host left (lobby should be deleted, but handle edge case)
      const hostStillPresent = lobbyData.players.find(p => p.uid === lobbyData.hostId);
      if (!hostStillPresent) {
        setError('Host left the game. Lobby closed.');
        setView('menu');
        setLobbyId('');
        // Clean up the orphaned lobby
        deleteDoc(doc(db, 'lobbies', lobbyId)).catch(err => console.error('Error cleaning up lobby:', err));
        return;
      }

      // Check if player was removed
      if (!lobbyData.players.find(p => p.uid === user.uid)) {
        setError('You were removed from the lobby');
        setView('menu');
        setLobbyId('');
        return;
      }

      // Update view based on lobby status
      if (lobbyData.status === 'playing' && view !== 'playing') {
        setView('playing');
        prepareQuestion(lobbyData.currentTrackIndex, lobbyData.tracks, fullPlaylist, lobbyData);
        previousTrackIndex = lobbyData.currentTrackIndex;
      } else if (lobbyData.status === 'playing' && view === 'playing') {
        // Initialize previousTrackIndex if not set
        if (previousTrackIndex === null) {
          previousTrackIndex = lobbyData.currentTrackIndex;
        }
        // Check if track index changed (host moved to next question)
        else if (lobbyData.currentTrackIndex !== previousTrackIndex) {
          prepareQuestion(lobbyData.currentTrackIndex, lobbyData.tracks, fullPlaylist, lobbyData);
          previousTrackIndex = lobbyData.currentTrackIndex;
        }
      } else if (lobbyData.status === 'finished' && view !== 'results') {
        setView('results');
      } else if (lobbyData.status === 'waiting' && view === 'playing') {
        setView('lobby');
      }
    });

    return () => unsubscribe();
  }, [lobbyId, user, view]);

  // Listen to available lobbies
  useEffect(() => {
    if (view !== 'join') return;

    const q = query(
      collection(db, 'lobbies'),
      where('status', '==', 'waiting')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lobbies = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lobby[];
      setAvailableLobbies(lobbies);
    });

    return () => unsubscribe();
  }, [view]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (spotifyPlayer) {
        try {
          spotifyPlayer.pause().catch(() => {});
        } catch (err) {
          console.error('Error pausing Spotify player:', err);
        }
      }
      
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [spotifyPlayer]);

  const handleSpotifyAuth = async () => {
    try {
      // Store current path for redirect after auth
      localStorage.setItem('spotify_auth_return_path', '/multiplayer');
      const authUrl = await getSpotifyAuthUrl();
      window.location.href = authUrl;
    } catch (err) {
      console.error('Error getting Spotify auth URL:', err);
      setError('Failed to connect to Spotify');
    }
  };

  const createLobby = async () => {
    if (!user || !isValidPlaylistUrl(playlistUrl)) {
      setError('Please enter a valid Spotify playlist URL');
      return;
    }

    if (playbackMode === 'sdk' && !spotifyToken) {
      setError('Please connect your Spotify Premium account to use Premium Mode');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const playlistId = extractPlaylistId(playlistUrl);
      if (!playlistId) {
        setError('Invalid Spotify playlist URL');
        return;
      }

      // Load playlist data
      const getPlaylist = httpsCallable(functions, 'getPlaylist');
      const playlistResult = await getPlaylist({ playlistId });
      const playlistData: any = playlistResult.data;

      if (!playlistData.success) {
        setError('Failed to load playlist');
        return;
      }

      // Get tracks
      const getTracks = httpsCallable(functions, 'getPlaylistTracks');
      const tracksResult = await getTracks({ playlistId, includeAll: playbackMode === 'sdk' });
      const tracksData: any = tracksResult.data;

      if (!tracksData.success || tracksData.tracks.length === 0) {
        setError('No tracks found in playlist');
        return;
      }

      let playableTracks = tracksData.tracks as SpotifyTrack[];

      if (playbackMode === 'preview') {
        playableTracks = filterTracksWithPreviews(tracksData.tracks);
        if (playableTracks.length < 4) {
          setError('Playlist needs at least 4 tracks with preview URLs');
          return;
        }
      } else {
        playableTracks = playableTracks.filter(track => 
          track.uri && !track.uri.startsWith('spotify:local:') && track.id
        );
        if (playableTracks.length < 4) {
          setError('Playlist needs at least 4 Spotify tracks');
          return;
        }
      }

      const shuffled = shuffleArray(playableTracks);
      const gameTracks = shuffled.slice(0, Math.min(totalQuestions, shuffled.length));
      setFullPlaylist(playableTracks); // Store full playlist for generating options

      // Create lobby in Firestore
      const lobbyRef = await addDoc(collection(db, 'lobbies'), {
        hostId: user.uid,
        players: [{
          uid: user.uid,
          displayName: user.displayName || 'Player',
          photoURL: user.photoURL || '',
          score: 0,
          answers: [],
          isReady: true
        }],
        playlistUrl,
        playlistInfo: playlistData.playlist,
        status: 'waiting',
        currentTrackIndex: 0,
        tracks: gameTracks,
        totalQuestions: gameTracks.length,
        playbackMode,
        createdAt: serverTimestamp()
      });

      setLobbyId(lobbyRef.id);
      setView('lobby');
    } catch (err: any) {
      console.error('Error creating lobby:', err);
      setError(err.message || 'Failed to create lobby');
    } finally {
      setLoading(false);
    }
  };

  const joinLobby = async (targetLobbyId: string) => {
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const lobbyRef = doc(db, 'lobbies', targetLobbyId);
      const lobbySnap = await getDoc(lobbyRef);

      if (!lobbySnap.exists()) {
        setError('Lobby not found');
        return;
      }

      const lobbyData = lobbySnap.data() as Lobby;

      if (lobbyData.status !== 'waiting') {
        setError('Game already started');
        return;
      }

      if (lobbyData.players.find(p => p.uid === user.uid)) {
        setError('You are already in this lobby');
        setLobbyId(targetLobbyId);
        setView('lobby');
        return;
      }

      // Check if Premium mode requires Spotify token
      if (lobbyData.playbackMode === 'sdk' && !spotifyToken) {
        setError('This lobby requires Spotify Premium. Please connect your account first.');
        setLobbyId(targetLobbyId);
        setView('lobby');
        return;
      }

      // Add player to lobby
      await updateDoc(lobbyRef, {
        players: arrayUnion({
          uid: user.uid,
          displayName: user.displayName || 'Player',
          photoURL: user.photoURL || '',
          score: 0,
          answers: [],
          isReady: false
        })
      });

      setLobbyId(targetLobbyId);
      setView('lobby');
    } catch (err: any) {
      console.error('Error joining lobby:', err);
      setError(err.message || 'Failed to join lobby');
    } finally {
      setLoading(false);
    }
  };

  const leaveLobby = async () => {
    if (!lobby || !user) return;

    try {
      const lobbyRef = doc(db, 'lobbies', lobby.id);

      if (isHost) {
        // If host leaves, delete the lobby
        await deleteDoc(lobbyRef);
      } else {
        // Remove player from lobby
        const updatedPlayers = lobby.players.filter(p => p.uid !== user.uid);
        await updateDoc(lobbyRef, {
          players: updatedPlayers
        });
      }

      setLobbyId('');
      setLobby(null);
      setView('menu');
    } catch (err) {
      console.error('Error leaving lobby:', err);
    }
  };

  const toggleReady = async () => {
    if (!lobby || !user || isHost) return;

    try {
      const updatedPlayers = lobby.players.map(p => 
        p.uid === user.uid ? { ...p, isReady: !p.isReady } : p
      );

      await updateDoc(doc(db, 'lobbies', lobby.id), {
        players: updatedPlayers
      });
    } catch (err) {
      console.error('Error toggling ready:', err);
    }
  };

  const startGame = async () => {
    if (!lobby || !isHost) return;

    const allReady = lobby.players.every(p => p.uid === lobby.hostId || p.isReady);
    if (!allReady) {
      setError('Not all players are ready');
      return;
    }

    try {
      // Pre-calculate start positions for all tracks
      const startPositions = lobby.tracks.map(track => {
        const trackDurationSeconds = track.duration_ms / 1000;
        const startTimeSeconds = getGaussianStartTime(trackDurationSeconds, 30);
        return Math.floor(startTimeSeconds * 1000);
      });

      await updateDoc(doc(db, 'lobbies', lobby.id), {
        status: 'playing',
        startedAt: serverTimestamp(),
        startPositions // Store calculated positions for all players to use
      });
    } catch (err) {
      console.error('Error starting game:', err);
    }
  };

  const prepareQuestion = async (index: number, tracks: SpotifyTrack[], allTracks: SpotifyTrack[], currentLobby?: Lobby) => {
    const track = tracks[index];
    const tracksForOptions = allTracks || fullPlaylist;
    const activeLobby = currentLobby || lobby;
    
    console.log('PrepareQuestion called - Track:', track.name, 'Mode:', activeLobby?.playbackMode);
    
    setCurrentTrack(track);
    
    // Generate options
    const allOptions = generateSmartMultipleChoiceOptions(
      track,
      tracksForOptions,
      new Set(),
      4
    );
    setOptions(allOptions);
    
    setSelectedAnswer(null);
    setShowAnswer(false);
    setQuestionStartTime(Date.now());

    // Play audio based on mode
    if (activeLobby?.playbackMode === 'preview' && track.preview_url) {
      // Preview mode
      if (audioRef.current) {
        audioRef.current.load();
        
        const handleLoadedMetadata = () => {
          const duration = audioRef.current?.duration || 30;
          const timerDuration = Math.min(Math.floor(duration), 30);
          setMaxTime(timerDuration);
          setTimeRemaining(timerDuration);
          audioRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
        
        audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
        
        audioRef.current.play().catch(err => {
          console.error('Failed to play audio:', err);
        });
      }
    } else if (activeLobby?.playbackMode === 'sdk' && spotifyToken && track.uri) {
      // SDK mode
      console.log('SDK Mode - Starting playback for track:', track.name);
      setMaxTime(30);
      setTimeRemaining(30);
      setSdkConnecting(true);
      
      try {
        // Wait for player and device to be initialized
        let currentPlayer = spotifyPlayer || (window as any).__spotifyPlayer;
        let currentDeviceId = spotifyDeviceId || (window as any).__spotifyDeviceId;
        
        console.log('Initial check - Player:', !!currentPlayer, 'Device:', !!currentDeviceId);
        
        // Retry loop for player initialization
        let retries = 0;
        const maxRetries = 10; // Increased retries
        
        while ((!currentPlayer || !currentDeviceId) && retries < maxRetries) {
          console.log(`Waiting for player/device... Retry ${retries + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, 500));
          currentPlayer = currentPlayer || spotifyPlayer || (window as any).__spotifyPlayer;
          currentDeviceId = currentDeviceId || spotifyDeviceId || (window as any).__spotifyDeviceId;
          retries++;
        }
        
        console.log('After waiting - Player:', !!currentPlayer, 'Device:', currentDeviceId);
        
        if (!currentPlayer) {
          console.error('Spotify player not initialized after waiting');
          throw new Error('Spotify player not initialized after waiting');
        }
        
        if (!currentDeviceId) {
          console.error('Spotify device not ready after waiting');
          throw new Error('Spotify device not ready after waiting');
        }
        
        // Update state if we got them from global
        if (currentPlayer && !spotifyPlayer) {
          setSpotifyPlayer(currentPlayer);
        }
        if (currentDeviceId && !spotifyDeviceId) {
          setSpotifyDeviceId(currentDeviceId);
        }
        
        // Check if player is connected and connect if needed
        console.log('Checking player connection...');
        let playerState = await currentPlayer.getCurrentState();
        console.log('Player state:', playerState ? 'Connected' : 'Disconnected');
        
        if (!playerState) {
          console.log('Connecting player...');
          await currentPlayer.connect();
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('Transferring playback to device...');
          await transferPlaybackToDevice(spotifyToken, currentDeviceId);
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Verify connection
          playerState = await currentPlayer.getCurrentState();
          console.log('Connection verified:', !!playerState);
        }
        
        // Use pre-calculated start position from lobby (calculated by host)
        const randomPosition = activeLobby?.startPositions?.[index] ?? 0;
        
        console.log(`Playing track at position: ${randomPosition}ms (${Math.floor(randomPosition / 1000)}s)`);
        
        // Play directly at the desired position for multiplayer
        const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${currentDeviceId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${spotifyToken}`,
          },
          body: JSON.stringify({
            uris: [track.uri],
            position_ms: randomPosition,
          }),
        });

        if (!playResponse.ok) {
          const errorText = await playResponse.text();
          console.error('Play API error:', playResponse.status, errorText);
          throw new Error(`Failed to play track: ${playResponse.status}`);
        }

        console.log('Track playing successfully!');
        setSdkConnecting(false);
      } catch (error) {
        console.error('Error in prepareQuestion SDK mode:', error);
        setSdkConnecting(false);
        setError('Failed to play track. Please check your Spotify connection.');
      }
    } else if (activeLobby?.playbackMode === 'sdk') {
      console.log('SDK mode but missing requirements - Token:', !!spotifyToken, 'URI:', !!track.uri);
      setError('Spotify Premium connection required. Please connect your account.');
    }
  };

  const handleAnswer = async (answer: string) => {
    if (showAnswer || !lobby || !user || !currentTrack) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

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

    // Update player's answers and score
    const updatedPlayers = lobby.players.map(p => {
      if (p.uid === user.uid) {
        return {
          ...p,
          score: p.score + (isCorrect ? points : 0),
          answers: [...p.answers, gameAnswer]
        };
      }
      return p;
    });

    await updateDoc(doc(db, 'lobbies', lobby.id), {
      players: updatedPlayers
    });

    // Pause audio
    if (lobby.playbackMode === 'preview' && audioRef.current) {
      audioRef.current.pause();
    } else if (lobby.playbackMode === 'sdk' && spotifyPlayer) {
      spotifyPlayer.pause();
    }
  };

  const handleTimeUp = async () => {
    if (showAnswer || !lobby || !user || !currentTrack) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setSelectedAnswer(null);
    setShowAnswer(true);

    const timeToAnswer = Date.now() - questionStartTime;
    const gameAnswer: GameAnswer = {
      trackId: currentTrack.id,
      correctAnswer: currentTrack.name,
      userAnswer: 'Time Out',
      isCorrect: false,
      timeToAnswer,
    };

    const updatedPlayers = lobby.players.map(p => {
      if (p.uid === user.uid) {
        return {
          ...p,
          answers: [...p.answers, gameAnswer]
        };
      }
      return p;
    });

    await updateDoc(doc(db, 'lobbies', lobby.id), {
      players: updatedPlayers
    });

    // Pause audio
    if (lobby?.playbackMode === 'preview' && audioRef.current) {
      audioRef.current.pause();
    } else if (lobby?.playbackMode === 'sdk' && spotifyPlayer) {
      spotifyPlayer.pause();
    }
  };

  const nextQuestion = async () => {
    if (!lobby || !isHost) return;

    const allAnswered = lobby.players.every(p => 
      p.answers.length > lobby.currentTrackIndex
    );

    if (!allAnswered) {
      setError('Waiting for all players to answer');
      return;
    }

    const nextIndex = lobby.currentTrackIndex + 1;

    if (nextIndex >= lobby.tracks.length) {
      // Game finished
      await finishGame();
    } else {
      // Move to next question - onSnapshot listener will trigger prepareQuestion for all players
      await updateDoc(doc(db, 'lobbies', lobby.id), {
        currentTrackIndex: nextIndex
      });
    }
  };

  const finishGame = async () => {
    if (!lobby || !isHost) return;

    try {
      await updateDoc(doc(db, 'lobbies', lobby.id), {
        status: 'finished'
      });

      // Save game sessions for each player
      for (const player of lobby.players) {
        const finalScore = player.score;
        const correctAnswers = player.answers.filter(a => a.isCorrect).length;

        // Save game session
        await addDoc(collection(db, 'gameSessions'), {
          userId: player.uid,
          playlistName: lobby.playlistInfo?.name || 'Unknown Playlist',
          playlistId: extractPlaylistId(lobby.playlistUrl),
          score: finalScore,
          totalQuestions: lobby.totalQuestions,
          correctAnswers,
          answers: player.answers,
          createdAt: serverTimestamp(),
          gameMode: 'multiplayer'
        });

        // Update user stats
        const userRef = doc(db, 'users', player.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const newHighScore = Math.max(userData.highScore || 0, finalScore);

          await updateDoc(userRef, {
            totalGamesPlayed: increment(1),
            totalScore: increment(finalScore),
            highScore: newHighScore
          });
        } else {
          await setDoc(userRef, {
            totalGamesPlayed: 1,
            totalScore: finalScore,
            highScore: finalScore
          });
        }
      }
    } catch (err) {
      console.error('Error finishing game:', err);
    }
  };

  const copyLobbyCode = () => {
    if (lobby) {
      navigator.clipboard.writeText(lobby.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const playAgain = async () => {
    if (!lobby || !isHost) return;

    try {
      // Reset lobby state
      const resetPlayers = lobby.players.map(p => ({
        ...p,
        score: 0,
        answers: [],
        isReady: p.uid === lobby.hostId
      }));

      await updateDoc(doc(db, 'lobbies', lobby.id), {
        status: 'waiting',
        currentTrackIndex: 0,
        players: resetPlayers
      });
    } catch (err) {
      console.error('Error resetting game:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#121212] via-[#1a1a1a] to-[#121212] py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-[#1db954] hover:text-[#1ed760] mb-4">
            <Music2 className="w-6 h-6" />
            <span className="text-xl font-bold">Guesstify</span>
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">Multiplayer Mode</h1>
          <p className="text-[#b3b3b3]">Compete with friends in real-time!</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg text-white font-semibold">
            {error}
          </div>
        )}

        {/* Menu View */}
        {view === 'menu' && (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8">
            <div className="space-y-4">
              <button
                onClick={() => setView('create')}
                className="w-full bg-[#1db954] text-white py-4 rounded-lg font-semibold hover:bg-[#1ed760] transition flex items-center justify-center gap-2"
              >
                <Users className="w-5 h-5" />
                Create Lobby
              </button>
              
              <button
                onClick={() => setView('join')}
                className="w-full bg-[#535353] text-white py-4 rounded-lg font-semibold hover:bg-[#636363] transition flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                Join Lobby
              </button>

              <Link href="/">
                <button className="w-full bg-[#282828] text-white py-4 rounded-lg font-semibold hover:bg-[#383838] transition">
                  Back
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* Create Lobby View */}
        {view === 'create' && (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Create Lobby</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#b3b3b3] mb-2">
                  Playback Mode
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setPlaybackMode('preview')}
                    className={`p-4 rounded-lg border-2 transition ${
                      playbackMode === 'preview'
                        ? 'border-[#1db954] bg-[#1db954] bg-opacity-10'
                        : 'border-[#535353] hover:border-[#636363]'
                    }`}
                  >
                    <Music2 className="w-6 h-6 text-[#1db954] mx-auto mb-2" />
                    <p className="text-white font-semibold">Preview Mode</p>
                    <p className="text-xs text-[#b3b3b3] mt-1">30s clips, no login required</p>
                  </button>
                  
                  <button
                    onClick={() => setPlaybackMode('sdk')}
                    className={`p-4 rounded-lg border-2 transition ${
                      playbackMode === 'sdk'
                        ? 'border-[#1db954] bg-[#1db954] bg-opacity-10'
                        : 'border-[#535353] hover:border-[#636363]'
                    }`}
                  >
                    <Volume2 className="w-6 h-6 text-[#1db954] mx-auto mb-2" />
                    <p className="text-white font-semibold">Premium Mode</p>
                    <p className="text-xs text-[#b3b3b3] mt-1">Full tracks, requires Premium</p>
                  </button>
                </div>
              </div>

              {/* Spotify Auth for SDK mode */}
              {playbackMode === 'sdk' && !spotifyToken && (
                <div className="bg-[#181818] border-2 border-[#535353] rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="w-6 h-6 text-[#1db954]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white mb-1">
                        Spotify Premium Required
                      </p>
                      <p className="text-sm text-[#b3b3b3] mb-3">
                        Premium Mode requires an active Spotify Premium subscription. Please connect your account to continue.
                      </p>
                      <button
                        onClick={handleSpotifyAuth}
                        className="w-full bg-[#1db954] text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-[#1ed760] transition flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                        Connect Spotify Premium
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Connected status for SDK mode */}
              {playbackMode === 'sdk' && spotifyToken && (
                <div className="bg-[#181818] border border-[#1db954] rounded-lg p-3">
                  <div className="flex items-center gap-2 text-[#1db954]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold">Spotify Premium Connected</span>
                  </div>
                </div>
              )}

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

              <div className="flex gap-3">
                <button
                  onClick={createLobby}
                  disabled={!isValidPlaylistUrl(playlistUrl) || loading || (playbackMode === 'sdk' && !spotifyToken)}
                  className="flex-1 bg-[#1db954] text-white py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating...' : 'Create Lobby'}
                </button>
                
                <button
                  onClick={() => setView('menu')}
                  className="px-6 bg-[#535353] text-white py-3 rounded-lg font-semibold hover:bg-[#636363] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Join Lobby View */}
        {view === 'join' && (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Join Lobby</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#b3b3b3] mb-2">
                Lobby Code
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter lobby code..."
                  className="flex-1 px-4 py-3 border border-[#535353] bg-[#121212] text-white rounded-lg focus:ring-2 focus:ring-[#1db954] focus:border-transparent outline-none"
                />
                <button
                  onClick={() => joinLobby(joinCode)}
                  disabled={!joinCode || loading}
                  className="px-6 bg-[#1db954] text-white py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join
                </button>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white mb-3">Available Lobbies</h3>
              
              {availableLobbies.length === 0 ? (
                <p className="text-[#b3b3b3] text-center py-8">No lobbies available</p>
              ) : (
                <div className="space-y-3">
                  {availableLobbies.map((availableLobby) => (
                    <div
                      key={availableLobby.id}
                      className="bg-[#181818] border border-[#535353] rounded-lg p-4 hover:border-[#1db954] transition cursor-pointer"
                      onClick={() => joinLobby(availableLobby.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-semibold">{availableLobby.playlistInfo?.name || 'Unnamed Playlist'}</p>
                          <p className="text-sm text-[#b3b3b3]">
                            {availableLobby.players.length} player{availableLobby.players.length !== 1 ? 's' : ''} • {availableLobby.totalQuestions} questions
                          </p>
                        </div>
                        <button className="bg-[#1db954] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1ed760] transition">
                          Join
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setView('menu')}
              className="w-full bg-[#535353] text-white py-3 rounded-lg font-semibold hover:bg-[#636363] transition"
            >
              Back
            </button>
          </div>
        )}

        {/* Lobby View */}
        {view === 'lobby' && lobby && (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">Lobby</h2>
                <div className="flex items-center gap-2">
                  <code className="bg-[#181818] px-3 py-1 rounded text-[#1db954] font-mono">
                    {lobby.id}
                  </code>
                  <button
                    onClick={copyLobbyCode}
                    className="p-2 hover:bg-[#535353] rounded transition"
                  >
                    {copied ? <Check className="w-4 h-4 text-[#1db954]" /> : <Copy className="w-4 h-4 text-[#b3b3b3]" />}
                  </button>
                </div>
              </div>
              
              <div className="bg-[#181818] rounded-lg p-4 mb-4">
                <p className="text-white font-semibold">{lobby.playlistInfo?.name}</p>
                <p className="text-sm text-[#b3b3b3]">{lobby.totalQuestions} questions • {lobby.playbackMode === 'sdk' ? 'Premium Mode' : 'Preview Mode'}</p>
              </div>
            </div>

            {/* Spotify Auth for SDK mode in lobby */}
            {lobby.playbackMode === 'sdk' && !spotifyToken && !isHost && (
              <div className="mb-6 bg-[#181818] border-2 border-[#535353] rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-6 h-6 text-[#1db954]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white mb-1">
                      Spotify Premium Required
                    </p>
                    <p className="text-sm text-[#b3b3b3] mb-3">
                      This lobby uses Premium Mode. Connect your Spotify Premium account to play.
                    </p>
                    <button
                      onClick={handleSpotifyAuth}
                      className="w-full bg-[#1db954] text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-[#1ed760] transition flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                      Connect Spotify Premium
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                Players ({lobby.players.length})
              </h3>
              <div className="space-y-2">
                {lobby.players.map((player) => (
                  <div
                    key={player.uid}
                    className="bg-[#181818] border border-[#535353] rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {player.photoURL ? (
                        <img src={player.photoURL} alt={player.displayName} className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#1db954] flex items-center justify-center">
                          <span className="text-white font-bold">{player.displayName[0]}</span>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-white font-semibold">{player.displayName}</p>
                          {player.uid === lobby.hostId && <Crown className="w-4 h-4 text-yellow-500" />}
                        </div>
                        <p className="text-xs text-[#b3b3b3]">
                          {player.isReady || player.uid === lobby.hostId ? 'Ready' : 'Not Ready'}
                        </p>
                      </div>
                    </div>
                    
                    {player.isReady || player.uid === lobby.hostId ? (
                      <div className="w-3 h-3 rounded-full bg-[#1db954]"></div>
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-[#535353]"></div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              {isHost ? (
                <button
                  onClick={startGame}
                  disabled={!lobby.players.every(p => p.uid === lobby.hostId || p.isReady)}
                  className="flex-1 bg-[#1db954] text-white py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Game
                </button>
              ) : (
                <button
                  onClick={toggleReady}
                  disabled={lobby.playbackMode === 'sdk' && !spotifyToken}
                  className={`flex-1 py-3 rounded-lg font-semibold transition ${
                    currentPlayer?.isReady
                      ? 'bg-[#535353] hover:bg-[#636363] text-white'
                      : 'bg-[#1db954] hover:bg-[#1ed760] text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {lobby.playbackMode === 'sdk' && !spotifyToken
                    ? 'Connect Spotify First'
                    : currentPlayer?.isReady ? 'Not Ready' : 'Ready'}
                </button>
              )}
              
              <button
                onClick={leaveLobby}
                className="px-6 bg-red-500 bg-opacity-20 border border-red-500 text-white py-3 rounded-lg font-semibold hover:bg-opacity-30 transition"
              >
                Leave
              </button>
            </div>
          </div>
        )}

        {/* Playing View */}
        {view === 'playing' && lobby && currentTrack && (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8 relative">
            {/* SDK Connecting Overlay */}
            {sdkConnecting && (
              <div className="absolute inset-0 bg-[#212121] bg-opacity-95 rounded-2xl flex items-center justify-center z-50">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-[#1db954] mb-4"></div>
                  <p className="text-white text-xl font-semibold">Connecting to Spotify...</p>
                  <p className="text-[#b3b3b3] mt-2">Please wait while we prepare playback</p>
                </div>
              </div>
            )}

            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[#b3b3b3] font-medium">
                  Question {lobby.currentTrackIndex + 1} of {lobby.tracks.length}
                </span>
                <span className="text-2xl font-bold text-[#1db954]">
                  Score: {currentPlayer?.score || 0}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-[#1db954] h-2 rounded-full transition-all"
                  style={{ width: `${((lobby.currentTrackIndex + 1) / lobby.tracks.length) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                What song is this?
              </h2>

              {/* Hidden Audio */}
              {currentTrack.preview_url && (
                <audio
                  ref={audioRef}
                  src={currentTrack.preview_url}
                  autoPlay
                  className="hidden"
                />
              )}

              {/* Volume Slider */}
              <div className="mb-4 px-4 py-3 bg-[#181818] rounded-lg">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-[#1db954] flex-shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume * 100}
                    onChange={(e) => setVolume(parseInt(e.target.value) / 100)}
                    className="flex-grow h-2 bg-[#535353] rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #1db954 0%, #1db954 ${volume * 100}%, #535353 ${volume * 100}%, #535353 100%)`
                    }}
                  />
                  <span className="text-[#b3b3b3] text-sm font-semibold min-w-[3ch]">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              </div>

              {/* Timer */}
              {!showAnswer && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-semibold">Time Remaining</span>
                    <span className={`text-2xl font-bold ${
                      timeRemaining <= 5 ? 'text-red-500' : 'text-[#1db954]'
                    }`}>
                      {timeRemaining}s
                    </span>
                  </div>
                  <div className="w-full bg-[#535353] rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ease-linear ${
                        timeRemaining <= 5 ? 'bg-red-500' : 'bg-[#1db954]'
                      }`}
                      style={{ width: `${(timeRemaining / maxTime) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Show answer result */}
              {showAnswer && (
                <div className="mb-6 p-4 bg-[#181818] rounded-lg">
                  <p className="text-lg font-semibold text-white mb-2">
                    {selectedAnswer === currentTrack.name ? 'Correct!' : 'Incorrect'}
                  </p>
                  <p className="text-[#b3b3b3]">
                    {currentTrack.name} - {currentTrack.artists.map(a => a.name).join(', ')}
                  </p>
                </div>
              )}
            </div>

            {/* Answer options */}
            {!showAnswer ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswer(option)}
                    className="p-4 bg-[#181818] border-2 border-[#535353] rounded-lg text-white font-semibold hover:border-[#1db954] hover:bg-[#1db954] hover:bg-opacity-10 transition"
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-6">
                {isHost ? (
                  <button
                    onClick={nextQuestion}
                    disabled={!lobby.players.every(p => p.answers.length > lobby.currentTrackIndex)}
                    className="w-full bg-[#1db954] text-white py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition disabled:opacity-50"
                  >
                    {lobby.players.every(p => p.answers.length > lobby.currentTrackIndex)
                      ? 'Next Question'
                      : 'Waiting for players...'}
                  </button>
                ) : (
                  <p className="text-center text-[#b3b3b3]">Waiting for host to continue...</p>
                )}
              </div>
            )}

            {/* Player scores */}
            <div className="bg-[#181818] rounded-lg p-4">
              <h3 className="text-sm font-semibold text-[#b3b3b3] mb-3">Current Standings</h3>
              <div className="space-y-2">
                {[...lobby.players]
                  .sort((a, b) => b.score - a.score)
                  .map((player, index) => (
                    <div key={player.uid} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[#b3b3b3] text-sm w-6">#{index + 1}</span>
                        <span className="text-white font-medium">{player.displayName}</span>
                      </div>
                      <span className="text-[#1db954] font-bold">{player.score}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Results View */}
        {view === 'results' && lobby && (
          <div className="bg-[#212121] rounded-2xl border border-[#535353] shadow-xl p-8">
            <div className="text-center mb-8">
              <Trophy className="w-16 h-16 text-[#1db954] mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-white mb-2">Game Over!</h2>
              <p className="text-[#b3b3b3]">{lobby.playlistInfo?.name}</p>
            </div>

            <div className="bg-[#181818] rounded-lg p-6 mb-6">
              <h3 className="text-xl font-bold text-white mb-4 text-center">Final Rankings</h3>
              <div className="space-y-3">
                {[...lobby.players]
                  .sort((a, b) => b.score - a.score)
                  .map((player, index) => (
                    <div
                      key={player.uid}
                      className={`p-4 rounded-lg flex items-center justify-between ${
                        index === 0 ? 'bg-[#1db954] bg-opacity-20 border-2 border-[#1db954]' : 'bg-[#212121]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold text-white w-8">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        {player.photoURL ? (
                          <img src={player.photoURL} alt={player.displayName} className="w-12 h-12 rounded-full" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#1db954] flex items-center justify-center">
                            <span className="text-white font-bold text-lg">{player.displayName[0]}</span>
                          </div>
                        )}
                        <div>
                          <p className="text-white font-bold">{player.displayName}</p>
                          <p className="text-sm text-[#b3b3b3]">
                            {player.answers.filter(a => a.isCorrect).length}/{lobby.totalQuestions} correct
                          </p>
                        </div>
                      </div>
                      <span className="text-2xl font-bold text-white">{player.score}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex gap-3">
              {isHost && (
                <button
                  onClick={playAgain}
                  className="flex-1 bg-[#1db954] text-white py-3 rounded-lg font-semibold hover:bg-[#1ed760] transition"
                >
                  Play Again
                </button>
              )}
              
              <button
                onClick={leaveLobby}
                className="flex-1 bg-[#535353] text-white py-3 rounded-lg font-semibold hover:bg-[#636363] transition"
              >
                Leave Lobby
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
