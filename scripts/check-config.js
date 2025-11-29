/**
 * Configuration Checker
 * Run this to verify your setup is correct
 * Usage: node scripts/check-config.js
 */

const fs = require('fs');
const path = require('path');

console.log('Checking Spotify Guessing Game Configuration...\n');

let errors = 0;
let warnings = 0;

// Check if .env.local exists
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('.env.local file not found');
  console.log('   Create one based on the template and add your credentials\n');
  errors++;
} else {
  console.log('.env.local file exists');
  
  // Read and check environment variables
  const envContent = fs.readFileSync(envPath, 'utf8');
  const requiredVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET'
  ];
  
  requiredVars.forEach(varName => {
    if (!envContent.includes(varName) || envContent.includes(`${varName}=your_`)) {
      console.warn(`${varName} not configured properly`);
      warnings++;
    }
  });
  
  if (warnings === 0) {
    console.log('All environment variables appear to be set\n');
  } else {
    console.log(`${warnings} environment variable(s) need attention\n`);
  }
}

// Check if Firebase is initialized
const firebaseJsonPath = path.join(__dirname, '..', 'firebase.json');
if (!fs.existsSync(firebaseJsonPath)) {
  console.error('firebase.json not found');
  console.log('   Run: firebase init\n');
  errors++;
} else {
  console.log('firebase.json exists');
}

// Check if Firestore rules exist
const firestoreRulesPath = path.join(__dirname, '..', 'firestore.rules');
if (!fs.existsSync(firestoreRulesPath)) {
  console.error('firestore.rules not found');
  errors++;
} else {
  console.log('firestore.rules exists');
}

// Check if functions are set up
const functionsIndexPath = path.join(__dirname, '..', 'functions', 'index.js');
if (!fs.existsSync(functionsIndexPath)) {
  console.error('functions/index.js not found');
  errors++;
} else {
  console.log('Firebase Functions configured');
  
  // Check if node_modules exist in functions
  const functionsNodeModules = path.join(__dirname, '..', 'functions', 'node_modules');
  if (!fs.existsSync(functionsNodeModules)) {
    console.warn('Functions dependencies not installed');
    console.log('   Run: cd functions && npm install\n');
    warnings++;
  } else {
    console.log('Functions dependencies installed');
  }
}

// Check if main dependencies are installed
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.error('Dependencies not installed');
  console.log('   Run: npm install\n');
  errors++;
} else {
  console.log('Dependencies installed');
}

// Summary
console.log('\n' + '='.repeat(50));
if (errors === 0 && warnings === 0) {
  console.log('All checks passed');
  console.log('\nNext steps:');
  console.log('1. Deploy Firestore rules: firebase deploy --only firestore:rules');
  console.log('2. Set Firebase secrets: firebase functions:secrets:set SPOTIFY_CLIENT_ID');
  console.log('3. Deploy functions: firebase deploy --only functions');
  console.log('4. Run dev server: npm run dev');
} else {
  console.log(`Found ${errors} error(s) and ${warnings} warning(s)`);
  console.log('\nPlease fix the issues above before proceeding.');
  console.log('See QUICKSTART.md for detailed setup instructions.');
}
console.log('='.repeat(50) + '\n');

process.exit(errors > 0 ? 1 : 0);
