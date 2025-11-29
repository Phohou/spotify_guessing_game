'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCodeFromUrl, exchangeCodeForToken } from '@/lib/spotify';

export default function CallbackPage() {
  const router = useRouter();
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      console.log('🎵 Callback page loaded (PKCE)');
      console.log('  Full URL:', window.location.href);
      console.log('  Search:', window.location.search);
      
      // Check for error
      const params = new URLSearchParams(window.location.search);
      const errorParam = params.get('error');
      if (errorParam) {
        console.error('❌ Auth error:', errorParam);
        setError(`Authentication error: ${errorParam}`);
        setDebugInfo(`Error: ${errorParam}`);
        setTimeout(() => router.push('/game'), 3000);
        return;
      }
      
      const code = getCodeFromUrl();
      console.log('  Authorization code:', code ? `${code.substring(0, 20)}...` : 'NOT FOUND');
      
      if (code) {
        try {
          console.log('Exchanging code for token...');
          const token = await exchangeCodeForToken(code);
          console.log('✅ Token received:', token.substring(0, 20) + '...');
          
          // Verify account has Premium
          const profileResponse = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const profile = await profileResponse.json();
          console.log('Account type:', profile.product);
          
          if (profile.product !== 'premium') {
            console.warn('Premium account required for full playback.');
            setError('Spotify Premium required for full playback. You can still use Preview Mode.');
            setDebugInfo(`Account type: ${profile.product}\nPremium Mode requires Spotify Premium subscription.`);
            // Still store token and redirect after delay
            localStorage.setItem('spotify_access_token', token);
            setTimeout(() => router.push('/game'), 4000);
            return;
          }
          
          // Store token in localStorage
          localStorage.setItem('spotify_access_token', token);
          console.log('✅ Token stored, redirecting to /game');
          
          // Redirect back to game page
          router.push('/game');
        } catch (err) {
          console.error('❌ Token exchange failed:', err);
          setError(err instanceof Error ? err.message : 'Failed to get access token');
          setDebugInfo(`Token exchange error: ${err}`);
          setTimeout(() => router.push('/game'), 3000);
        }
      } else {
        console.error('❌ No authorization code found');
        setDebugInfo(`Search: ${window.location.search}`);
        setTimeout(() => router.push('/game'), 3000);
      }
    };
    
    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121212]">
      <div className="text-white text-center max-w-2xl p-8">
        {!error && (
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#1db954]"></div>
        )}
        <p className="mt-4">{error || 'Connecting to Spotify...'}</p>
        {debugInfo && (
          <pre className="mt-4 text-left text-xs bg-[#212121] p-4 rounded overflow-auto">
            {debugInfo}
          </pre>
        )}
      </div>
    </div>
  );
}
