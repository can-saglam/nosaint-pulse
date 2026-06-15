# Deploying Pulse (the survey tool)

Pulse is a **static single-page app**. There's no backend — survey data is stored
in the browser's `localStorage` and moved between machines with the built-in
**Back up / Import** buttons. That makes hosting trivial, free, and safe.

## 1. Build

```bash
npm install
npm run build
```

This produces a `dist/` folder — that's the entire site.

## 2. Host it (free) — pick one

### Option A — Netlify Drop (easiest, ~30 seconds, no Git)
1. Go to https://app.netlify.com/drop
2. Drag the **`dist`** folder onto the page.
3. You get a live `https://<name>.netlify.app` URL. Done.
   (Free, HTTPS, global CDN. Sign in to keep/rename the site.)

### Option B — Cloudflare Pages (best free tier, Git-based)
1. Push this repo to GitHub.
2. Cloudflare dashboard → **Pages → Create → Connect to Git**.
3. Build command: `npm run build` · Output directory: `dist`.
4. Deploy. Every push redeploys automatically.

### Option C — Vercel
`npx vercel` in the project root, or import the repo at vercel.com.
Framework preset: **Vite**. Output: `dist`.

No SPA-routing redirects are needed — Pulse is a single page with no client-side
router.

## 3. Lock it down (recommended for an internal tool)

The app has no login, so anyone with the URL can view/edit. Put it behind free
access control:

- **Cloudflare Access** (free for small teams) — email-based gate in front of the
  Pages site.
- **Netlify** — site password (Site settings → Access control) or Netlify Identity.

## 4. How data persists

- Edits, new surveys, statuses, branches, and canvas positions are saved to
  `localStorage` automatically (key `nosaint-surveys-v3`).
- **Back up** (app bar) downloads `pulse-backup.json` with every survey.
- **Import** accepts either a single survey (adds it) or a full backup (replaces
  everything — undoable with ⌘Z).
- To move your work to another browser/device: **Back up** here → **Import** there.
- **Reset to defaults** (footer) restores the original 6 seed surveys.

## 5. If you later want shared, multi-user persistence

Swap the persistence layer in `src/App.tsx` (`loadSurveys` + the save `useEffect`)
for a free hosted DB — **Firebase Firestore** is the lowest-effort (a single
`surveys` collection; doesn't pause on inactivity). That's the only change needed;
the rest of the app already treats the `surveys` array as the single source of
truth.
