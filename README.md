# Sonodrop

A local music player for Linux where everything moves like liquid. Electron + React + WebGL.

## Install

Grab a package from the [Releases](https://github.com/Jai-Advitheeya-Lella/sonodrop/releases) page:

| Your system                | Take                    | Then                                                        |
| -------------------------- | ----------------------- | ----------------------------------------------------------- |
| Any distro                 | `Sonodrop-…​.AppImage`   | `chmod +x Sonodrop-*.AppImage && ./Sonodrop-*.AppImage`     |
| Debian, Ubuntu, Mint       | `Sonodrop-…​.deb`        | `sudo apt install ./Sonodrop-*.deb`                         |
| Arch, Manjaro, EndeavourOS | `Sonodrop-…​.pacman`     | `sudo pacman -U Sonodrop-*.pacman`                          |
| Fedora, openSUSE           | `Sonodrop-…​.rpm`        | `sudo dnf install ./Sonodrop-*.rpm`                         |
| Anything else              | `Sonodrop-…​.tar.gz`     | unpack anywhere and run `./sonodrop`                        |

- The AppImage needs FUSE 2 (`libfuse2` on Debian/Ubuntu, `fuse2` on Arch). Without it, run
  `./Sonodrop-*.AppImage --appimage-extract-and-run`. If it stops with a sandbox error on a recent Ubuntu, use the `.deb`.
- **ffmpeg** is optional. It powers SoX resampling; everything else works without it.

First launch scans `~/Music`. Add other folders in **Themes & Settings → Music folders**, or drag folders and
files onto the window. Your library, playlists, likes and settings live in `~/.config/sonodrop/`.

## What's in it

- **Formats** MP3, FLAC, WAV, plus OGG, Opus and AAC/M4A.
- **Library** Albums / Songs / Artists, sortable by name, date added and more, ascending or descending.
  Albums come in two layouts: a grid, or **Record view** — the sleeves on a 3D ring you spin with the wheel, a drag or the arrow keys.
- **Search** across titles, artists, albums, genres, file names and folder paths (`Ctrl K`).
- **Equaliser** ten bands plus pre-amp, presets, clipping guard, and a curve showing the filters' true response over the live spectrum.
- **SoX resampling** every track converted by the SoX resampler (very-high-quality setting) to the device rate or up to 192 kHz.
- **Visualisers** Ink, Aurora, Mandala, Silk and Rain.
- **Now Playing** (`N`) a ray-marched 3D body of liquid that reacts to the music and reflects the album art.
- **Desktop widgets** small always-on-top windows: mini player, turntable, visualiser, poster, strip, up next.
- **Themes** twelve, including Cyberpunk, light ones, and Chameleon, which takes its colours from the current cover.
- Queue, playlists, liked songs, shuffle/repeat, media keys, session restore, keyboard shortcuts.

### Sending high sample rates to your DAC

Sonodrop hands audio to the system mixer, and the mixer decides what the device receives. PipeWire runs at
48 kHz unless told otherwise, so anything above that is converted back down on the way out. For a higher rate
to reach the hardware, raise the mixer's rate to match what you pick in **Sound → Resampling**:

```
# ~/.config/pipewire/pipewire.conf.d/10-rate.conf
context.properties = {
  default.clock.rate = 96000
}
```

then `systemctl --user restart pipewire pipewire-pulse` and restart Sonodrop. "Device rate" needs none of
this: it converts straight to whatever the mixer is running at.

### Desktop widgets on tiling window managers

Widget windows are fixed-size, so Hyprland, Sway and friends float them automatically. To keep them on every
workspace, add a rule that pins windows whose title starts with `Sonodrop Widget`.

## Build it yourself

```bash
npm install
npx install-electron   # only if npm skipped Electron's download
npm start              # build, then launch
npm run dev            # launch with hot reload
npm run dist           # AppImage + tar.gz into dist/
npm run dist:all       # …plus .deb and .pacman (needs a Debian/Ubuntu-like host)
```

Pushing a tag like `v0.2.0` runs [.github/workflows/release.yml](.github/workflows/release.yml), which builds
every package format and attaches them to a GitHub Release.

Set `SONODROP_DATA_DIR=/some/dir` to run against a separate profile.

## How it's put together

```
src/main/        Electron main process
  library.ts       folder scanning, tag reading, cover cache
  protocol.ts      sono:// — streams audio and artwork to the UI by id
  resampler.ts     SoX resampling through ffmpeg
src/preload/     the narrow bridge the UI is allowed to call (window.sono)
src/shared/      types and the desktop-widget list, used on both sides
src/renderer/src
  audio/           engine (playback, equaliser, analysis) and the live audio feed visuals read
  stores/          state: library, player, user data, UI/settings
  fluid/           shaders (backdrop turntable, 3D scene, visualisers), drips, splashes, theme curtain
  components/      player bar, track table, record ring, cards, queue, menus…
  views/           Home, Library, album/artist/playlist pages, Search, Sound, Settings
  desktop/         what each desktop widget window draws
  widgets/         the cards on Home
  themes/          theme definitions
  styles/          CSS
```

## Extending it

| To add…           | Do this                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| A theme           | Append an entry to `THEMES` in `themes/index.ts` (three accent colours, a background).           |
| A visualiser      | Write a fragment-shader body in `fluid/visuals.ts` and append it to `VISUALS`.                   |
| A desktop widget  | Describe it in `shared/widgets.ts`, give it a component in `desktop/registry.tsx`.               |
| An EQ preset      | Add a row to `EQ_PRESETS` in `views/Sound.tsx`.                                                  |
| An audio format   | Add the extension to `AUDIO_EXT` in `main/library.ts` and its MIME type in `protocol.ts`.        |
| An icon           | Add a path to `components/Icon.tsx`.                                                             |
| A page            | Add a variant to `Route` in `stores/ui.ts` and a case in `App.tsx`.                              |
| A new track field | Add it to `Track`, fill it in `readTrack`, bump `LIBRARY_VERSION` (forces one re-scan).          |

Animations stay smooth through a few rules worth keeping: one shared `requestAnimationFrame` loop
(`lib/ticker.ts`); per-frame visuals write to canvases or `transform`, never React state; the shaders lower
their own resolution when frames run late (`AdaptiveScale` in `fluid/gl.ts`); long lists and the record ring
only keep on-screen items in the DOM.
