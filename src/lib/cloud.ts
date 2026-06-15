// Cloud sync via Firebase Firestore. A single document holds every survey, so
// any device editing it stays in lock-step (live) with the others.
//
// Firebase is loaded lazily (dynamic import) so it's only downloaded when cloud
// sync is actually configured — the base app stays light when it's off.
import { cloudEnabled, firebaseConfig } from "@/firebase-config";
import type { Segment } from "@/data/surveys";

export type CloudStatus = "off" | "connecting" | "synced" | "error";

export const isCloud = cloudEnabled;

type FB = {
  db: import("firebase/firestore").Firestore;
  auth: import("firebase/auth").Auth;
  signInAnonymously: typeof import("firebase/auth").signInAnonymously;
  doc: typeof import("firebase/firestore").doc;
  onSnapshot: typeof import("firebase/firestore").onSnapshot;
  setDoc: typeof import("firebase/firestore").setDoc;
};

let fbPromise: Promise<FB> | null = null;

async function load(): Promise<FB> {
  if (!fbPromise) {
    fbPromise = (async () => {
      const [{ initializeApp }, authMod, fsMod] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      const app = initializeApp(firebaseConfig);
      return {
        db: fsMod.getFirestore(app),
        auth: authMod.getAuth(app),
        signInAnonymously: authMod.signInAnonymously,
        doc: fsMod.doc,
        onSnapshot: fsMod.onSnapshot,
        setDoc: fsMod.setDoc,
      };
    })();
  }
  return fbPromise;
}

/**
 * Subscribe to the shared surveys document.
 * - `onRemote` fires whenever the cloud changes (including the first load); it
 *   receives `null` when the document doesn't exist yet (caller seeds it).
 * - returns an unsubscribe fn.
 */
export function subscribeCloud(
  onRemote: (surveys: Segment[] | null) => void,
  onStatus: (s: CloudStatus) => void
): () => void {
  if (!cloudEnabled) {
    onStatus("off");
    return () => {};
  }
  onStatus("connecting");
  let unsub = () => {};
  let cancelled = false;
  (async () => {
    try {
      const fb = await load();
      if (cancelled) return;
      await fb.signInAnonymously(fb.auth);
      if (cancelled) return;
      const ref = fb.doc(fb.db, "pulse", "state");
      unsub = fb.onSnapshot(
        ref,
        (snap) => {
          onStatus("synced");
          const data = snap.data();
          onRemote(data && Array.isArray(data.surveys) ? (data.surveys as Segment[]) : null);
        },
        () => onStatus("error")
      );
    } catch {
      onStatus("error");
    }
  })();
  return () => {
    cancelled = true;
    unsub();
  };
}

/** Write the full surveys array to the cloud. */
export async function pushCloud(surveys: Segment[]): Promise<void> {
  if (!cloudEnabled) return;
  const fb = await load();
  await fb.setDoc(fb.doc(fb.db, "pulse", "state"), {
    surveys,
    updatedAt: Date.now(),
  });
}
