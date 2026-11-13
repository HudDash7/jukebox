# Budsbox

A Minecraft-styled music player with a Spotify-style layout: shared library, playlists, artist pages,
lyrics, album covers, shuffle/repeat, Jam (listen together), and a leaderboard.

## Files
- `index.html`: page markup (and the build id in `<meta name="budsbox-build">`)
- `css/app.css`: all styles
- `js/app.js`: all app code (Supabase auth, database, storage and realtime)
- `manifest.webmanifest`, `*.png`: home-screen app name and icons
- `scripts/bump-build.sh`: run before each deploy so open copies show "New version available"

## Hosting
GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.

## Database
Setup SQL is in the comment at the top of `js/app.js`. Run each block once in Supabase → SQL Editor.
