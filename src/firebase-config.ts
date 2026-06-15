// ---------------------------------------------------------------------------
// Firebase config — paste your project's web config here to turn on cloud sync.
//
// How to get it (2 minutes, free):
//   1. https://console.firebase.google.com → Add project (any name) → continue
//      through the steps (Analytics can be off).
//   2. In the project: click the </> "Web" icon to register a web app → copy the
//      `firebaseConfig` object it shows you.
//   3. Build → Firestore Database → Create database → Start in *production mode*.
//   4. Build → Authentication → Get started → enable *Anonymous* sign-in.
//   5. Firestore → Rules tab → paste the rule from firestore.rules (in this repo)
//      → Publish.
//   6. Paste the values below, then run `npm run deploy`.
//
// These values are NOT secret — Firebase web config is meant to be public; access
// is controlled by the Firestore security rules.
// ---------------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: "AIzaSyAUN98THsDbn3E4AonWmyA5qEqU4FORXag",
  authDomain: "nosaint-survey.firebaseapp.com",
  projectId: "nosaint-survey",
  storageBucket: "nosaint-survey.firebasestorage.app",
  messagingSenderId: "599975196445",
  appId: "1:599975196445:web:bddfa000fdfeed119753f4",
};

// Cloud sync is enabled only once you've replaced the placeholders above.
export const cloudEnabled =
  !Object.values(firebaseConfig).some((v) => v.startsWith("PASTE_"));
