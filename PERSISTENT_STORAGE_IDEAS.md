# Persistent storage for notes — ideas to revisit

## Problem

Notes (and review status / exam progress) are currently saved to `localStorage`
only (`app.js`, `STORAGE_KEYS`). That's per-browser, per-device — clearing site
data or switching devices loses everything. This is a static site with no
backend (see README — deploys as-is to GitHub Pages), so there's no database
to write to.

## Options considered

1. **Export / Import (JSON file download/upload)**
   - User clicks "Export notes" → downloads a `.json` file; "Import notes" →
     picks a file and restores it.
   - Pros: zero infrastructure, no secrets/auth, works on every browser,
     simple to implement and test.
   - Cons: manual — user has to remember to export/import, no automatic
     cross-device sync.
   - **Recommended starting point.**

2. **Sync to user's own GitHub Gist**
   - User pastes a personal access token (stored locally); app reads/writes a
     Gist as the notes store.
   - Pros: real cross-device sync, still no backend of ours to run/maintain.
   - Cons: token has to be entered/stored client-side, extra API/error-handling
     code, more moving parts to get right and to explain to users.
   - Treat as an optional add-on later, not a first step.

3. **Browser File System Access API** (save to a local file the user picks)
   - Pros: persistent file, auto-load on return.
   - Cons: Chromium-only, not a real cross-device solution either.

## Next step (when revisited)

Build Export/Import first (option 1). Gist sync (option 2) only if cross-device
sync turns out to matter enough to justify the added complexity.
