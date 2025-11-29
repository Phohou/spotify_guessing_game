'use client';

import { useAuth } from '@/lib/hooks';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Music2, Play, Library, Trophy, User, LogOut, Zap } from 'lucide-react';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212]">
        <div className="text-white text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#1db954]"></div>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212] p-4">
        <div className="text-center text-white max-w-4xl">
          <div className="mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Music2 className="w-16 h-16 text-[#1db954]" />
              <h1 className="text-7xl font-bold tracking-tight">
                GuessTify
              </h1>
            </div>
            <p className="text-2xl mb-4 text-[#b3b3b3]">
              Test your music knowledge with Spotify
            </p>
            <p className="text-lg text-[#b3b3b3] max-w-2xl mx-auto">
              Play with any public playlist, compete on the leaderboard, and prove you're the ultimate music expert!
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button asChild size="lg" className="bg-[#1db954] text-white hover:bg-[#1ed760] text-lg px-8 py-6">
              <Link href="/login">
                Get Started Free
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-[#212121] text-white border-[#535353] hover:bg-[#2a2a2a] text-lg px-8 py-6">
              <Link href="/leaderboard">
                View Leaderboard
              </Link>
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-16">
            <Card className="bg-[#212121] border-[#535353] text-white hover:bg-[#2a2a2a] transition-colors">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Library className="w-8 h-8 text-[#1db954]" />
                  <CardTitle className="text-2xl">Any Playlist</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-[#b3b3b3]">Use any public Spotify playlist to create your custom game experience</p>
              </CardContent>
            </Card>
            
            <Card className="bg-[#212121] border-[#535353] text-white hover:bg-[#2a2a2a] transition-colors">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-8 h-8 text-[#1db954]" />
                  <CardTitle className="text-2xl">Compete</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-[#b3b3b3]">Climb the leaderboard and show off your music knowledge to the world</p>
              </CardContent>
            </Card>
            
            <Card className="bg-[#212121] border-[#535353] text-white hover:bg-[#2a2a2a] transition-colors">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-8 h-8 text-[#1db954]" />
                  <CardTitle className="text-2xl">Quick Games</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-[#b3b3b3]">Choose from 5 to 20 questions for a quick challenge or marathon session</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212]">
      <nav className="bg-[#212121] border-b border-[#535353]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Music2 className="w-6 h-6 text-[#1db954]" />
              <h1 className="text-2xl font-bold text-white">GuessTify</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[#b3b3b3] hidden sm:inline">{user.displayName || user.email}</span>
              <Button
                onClick={handleSignOut}
                variant="ghost"
                className="text-white hover:bg-[#2a2a2a]"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Welcome back, {user.displayName || 'Player'}!
          </h2>
          <p className="text-xl text-white/90">
            Choose how you want to play
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card className="group hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer border-2 border-[#535353] hover:border-[#1db954] bg-[#212121] text-white">
            <Link href="/game">
              <CardHeader>
                <Play className="w-12 h-12 mb-2 text-[#1db954]" />
                <CardTitle className="text-2xl">Start New Game</CardTitle>
                <CardDescription className="text-base text-[#b3b3b3]">
                  Enter a Spotify playlist URL and start guessing songs!
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>

          <Card className="group hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer border-2 border-[#535353] hover:border-[#1db954] bg-[#212121] text-white">
            <Link href="/playlists">
              <CardHeader>
                <Library className="w-12 h-12 mb-2 text-[#1db954]" />
                <CardTitle className="text-2xl">Browse Playlists</CardTitle>
                <CardDescription className="text-base text-[#b3b3b3]">
                  Explore and play playlists shared by other users
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>

          <Card className="group hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer border-2 border-[#535353] hover:border-[#1db954] bg-[#212121] text-white">
            <Link href="/leaderboard">
              <CardHeader>
                <Trophy className="w-12 h-12 mb-2 text-[#1db954]" />
                <CardTitle className="text-2xl">Leaderboard</CardTitle>
                <CardDescription className="text-base text-[#b3b3b3]">
                  See how you rank against other players
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>

          <Card className="group hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer border-2 border-[#535353] hover:border-[#1db954] bg-[#212121] text-white">
            <Link href="/profile">
              <CardHeader>
                <User className="w-12 h-12 mb-2 text-[#1db954]" />
                <CardTitle className="text-2xl">Your Profile</CardTitle>
                <CardDescription className="text-base text-[#b3b3b3]">
                  View your stats and saved playlists
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>
        </div>
      </main>
    </div>
  );
}
