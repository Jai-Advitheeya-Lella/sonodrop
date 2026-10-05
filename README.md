# Sonodrop

A local music player where everything moves like liquid. Electron + React + WebGL.

## Run it

```bash
npm install
npx install-electron   # only if npm skipped Electron's download
npm start              # build, then launch
npm run dev            # launch with hot reload while you work on it
```

First launch scans `~/Music`. Add other folders in **Themes & Settings → Music folders**, or drag folders and
files onto the window. Your library, playlists, likes and settings live in `~/.config/sonodrop/`.
Set `SONODROP_DATA_DIR=/some/dir` to run against a separate profile.

## What's in it

- **Formats** MP3, FLAC, WAV, plus OGG, Opus and AAC/M4A (anything Chromium decodes).
- **Library** Albums / Songs / Artists, each sortable by name, date added and more, ascending or descending.
- **Search** across titles, artists, albums, genres, file names and folder paths (`Ctrl K`).
- **Artwork** everywhere: embedded covers, or `cover.jpg` / `folder.png` beside the files.
- **Now Playing** (`N`): a ray-marched 3D body of liquid that reacts to the music and reflects the album art.
  Move the pointer to lean the camera, drag to orbit.
- **Widgets** a customisable Home dashboard, and a floating mini player window.
- **Themes** eleven, including light ones and Chameleon, which takes its colours from the current cover.
- Queue, playlists, liked songs, shuffle/repeat, media keys, session restore, keyboard shortcuts.

## How it's put together

```
src/main/        Electron main process
  library.ts       folder scanning, tag reading, cover cache
  protocol.ts      sono:// — streams audio and artwork to the UI by id
src/preload/     the narrow bridge the UI is allowed to call (window.sono)
src/shared/      types used on both sides
src/renderer/src
  audio/engine.ts  playback + live bass/mid/treble/beat levels
  stores/          state: library, player, user data, UI/settings
  fluid/           the liquid: shaders, gooey drips, splashes, the theme-change curtain
  components/      player bar, track table, cards, queue, menus…
  views/           Home, Library, album/artist/playlist pages, Search, Settings
  widgets/         Home widgets
  themes/          theme definitions
  styles/          CSS
```

## Extending it

| To add…            | Do this                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| A theme            | Append an entry to `THEMES` in `themes/index.ts` (three accent colours, a background).      |
| A Home widget      | Write a component, list it in `widgets/registry.tsx`.                                       |
| An audio format    | Add the extension to `AUDIO_EXT` in `main/library.ts` and its MIME type in `protocol.ts`.   |
| An icon            | Add a path to `components/Icon.tsx`.                                                        |
| A page             | Add a variant to `Route` in `stores/ui.ts` and a case in `App.tsx`.                         |
| A new track field  | Add it to `Track`, fill it in `readTrack`, bump `LIBRARY_VERSION` (forces one re-scan).     |
| A different liquid | Shaders are plain GLSL strings in `fluid/shaders.ts`; colours and audio arrive as uniforms. |

Animations stay smooth through a few rules worth keeping: one shared `requestAnimationFrame` loop
(`lib/ticker.ts`); per-frame visuals write to canvases or `transform`, never React state; the shaders lower
their own resolution when frames run late (`AdaptiveScale` in `fluid/gl.ts`); long lists are windowed.
