import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDcZxxlQqwZDpdCYsVLE9QFB6aRK7Olkew",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "invoice-c797f.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "invoice-c797f",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "invoice-c797f.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "631933281935",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:631933281935:web:9555111c7691cdcff832fa",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-7ES2SR6Y5D",
};

// Initialize Firebase App exactly once
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

// Initialize Cloud Firestore
export const firestore: Firestore = getFirestore(app);

// Initialize Firebase Storage
export const storage: FirebaseStorage = getStorage(app);

// Initialize Analytics conditionally (only when supported in browser environment)
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch((err) => {
      console.warn('Firebase Analytics not supported in this environment:', err);
    });
}
