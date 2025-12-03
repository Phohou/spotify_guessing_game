import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GuessTify - Spotify Music Guessing Game",
  description: "Test your music knowledge! Guess songs from Spotify playlists in Preview Mode or Premium Mode with full playback controls.",
  openGraph: {
    title: "GuessTify - Spotify Music Guessing Game",
    description: "Test your music knowledge! Guess songs from Spotify playlists in Preview Mode or Premium Mode.",
    url: "https://guesstify.vercel.app",
    siteName: "GuessTify",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "GuessTify - Spotify Music Guessing Game",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GuessTify - Spotify Music Guessing Game",
    description: "Test your music knowledge! Guess songs from Spotify playlists.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.onSpotifyWebPlaybackSDKReady = () => {
                window.spotifyReady = true;
                window.dispatchEvent(new Event('spotify-ready'));
              };
            `,
          }}
        />
        <script src="https://sdk.scdn.co/spotify-player.js" async></script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
