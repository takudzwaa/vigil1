
export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCI0Q4Aui5F2V0rM2DS4ctD5YninILEg90",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "vigil1.firebaseapp.com",
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://vigil1-default-rtdb.firebaseio.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "vigil1",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "vigil1.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "149570184237",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:149570184237:web:be4d5d8fdd9ed45fc1c4a4"
};