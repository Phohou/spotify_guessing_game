# 🎵 Spotify Guessing Game

Test your music knowledge by guessing songs from your favorite Spotify playlists! A fun, interactive web game built with Next.js and Firebase.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Firebase](https://img.shields.io/badge/Firebase-10-orange)

## ✨ Features

- 🎮 **Dual Playback Modes**
  - **Preview Mode** - Free mode using 30-second Spotify previews (limited song selection)
  - **Premium Mode** - Full playback for Spotify Premium users (works with all songs)
- 🔐 **Secure Authentication** - Email/password or Google sign-in
- 📊 **Smart Scoring** - Points based on accuracy and speed
- 🏆 **Leaderboard** - Compete with players worldwide
- 📚 **Playlist Sharing** - Browse community playlists
- 👤 **User Profiles** - Track your stats and game history
- 🎨 **Spotify Design** - Official Spotify color palette with Lucide icons

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Firebase account
- Spotify Developer account

### Installation

1. **Clone and install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **Set up environment variables**
   - Copy \`.env.local\` and add your credentials
   - See \`QUICKSTART.md\` for detailed instructions

3. **Deploy Firestore rules**
   \`\`\`bash
   firebase deploy --only firestore:rules
   \`\`\`

4. **Deploy Firebase Functions**
   \`\`\`bash
   firebase deploy --only functions
   \`\`\`

5. **Run development server**
   \`\`\`bash
   npm run dev
   \`\`\`

📖 **For detailed setup instructions, see [QUICKSTART.md](./QUICKSTART.md)**

## 🎯 How to Play

1. Sign in with email or Google
2. Choose your playback mode:
   - **Preview Mode** - Free, no Spotify account needed (limited songs)
   - **Premium Mode** - Connect Spotify Premium (all songs supported)
3. Enter a public Spotify playlist URL
4. Choose number of questions (5-20)
## 🏗️ Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend**: Firebase (Auth, Firestore, Cloud Functions v2)
- **API**: Spotify Web API + Spotify Web Playback SDK
- **UI Library**: shadcn/ui with Lucide React icons
- **Deployment**: Firebase Hosting / Vercelyour Spotify app:

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Select your app (or create one)
3. Click **Settings**
4. Add Redirect URIs:
   - For local development: `http://localhost:3000/callback`
   - For production: `https://yourdomain.com/callback`
5. Save changes
6. Copy your **Client ID** and **Client Secret** to `.env.local`

## 🏗️ Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Cloud Functions)
- **API**: Spotify Web API
- **Deployment**: Firebase Hosting / Vercel

## 📁 Project Structure

\`\`\`
spotify_guessing_game/
├── app/              # Next.js pages
├── components/       # React components
├── functions/        # Firebase Cloud Functions
├── lib/              # Utilities and configs
└── public/           # Static assets
\`\`\`

## 🔒 Security

- Firestore security rules implemented
- Spotify credentials secured in Firebase Functions
- Client-side authentication with Firebase Auth

## 📝 Documentation

- [Quick Start Guide](./QUICKSTART.md) - Get up and running in 5 minutes
- [Setup Guide](./SETUP_GUIDE.md) - Detailed setup and deployment instructions

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit PRs.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Spotify Web API for music data
- Firebase for backend infrastructure
- Next.js team for the amazing framework

---

Built with ❤️ and 🎵
