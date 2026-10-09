# Sonodrop

A local music player for Linux where everything moves like liquid. Electron + React + WebGL.

## Install

Open a terminal, paste this line and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/Jai-Advitheeya-Lella/sonodrop/master/install.sh | bash
```

Then open **Sonodrop** from your application menu. That's it.

- Works on any 64-bit Linux desktop, including immutable ones such as **Bazzite**, Fedora Silverblue and SteamOS.
- It needs no password and installs only into your home folder (`~/.local/share/sonodrop`).
- **To update**, run the same line again.
- **To remove**, run: `curl -fsSL https://raw.githubusercontent.com/Jai-Advitheeya-Lella/sonodrop/master/install.sh | bash -s -- --uninstall`

On first launch Sonodrop scans your `~/Music` folder. Add other folders in **Themes & Settings → Music folders**, or
drag folders and files onto the window. Your library, playlists, likes and settings live in `~/.config/sonodrop/`.

Two optional helpers unlock more; most desktops already have both, and Sonodrop tells you if one is missing:

- **ffmpeg** plays the formats the built-in decoder can't (ALAC, AIFF, APE, WavPack, WMA, DSD…) and does the SoX resampling.
- **pacat** (package `pulseaudio-utils`, or `libpulse` on Arch) drives surround speakers and subwoofers. Without it Sonodrop plays in stereo.

<details>
<summary>Other ways to install</summary>

Every release on the [Releases](https://github.com/Jai-Advitheeya-Lella/sonodrop/releases) page also has native packages:

| Your system                | Take                    | Then                                                        |
| -------------------------- | ----------------------- | ----------------------------------------------------------- |
| Debian, Ubuntu, Mint       | `Sonodrop-…​.deb`        | `sudo apt install ./Sonodrop-*.deb`                         |
| Arch, Manjaro, EndeavourOS | `Sonodrop-…​.pacman`     | `sudo pacman -U Sonodrop-*.pacman`                          |
| Fedora, openSUSE           | `Sonodrop-…​.rpm`        | `sudo dnf install ./Sonodrop-*.rpm`                         |
| Any distro, no install     | `Sonodrop-…​.AppImage`   | `chmod +x Sonodrop-*.AppImage && ./Sonodrop-*.AppImage`     |
| Anything else              | `Sonodrop-…​.tar.gz`     | unpack anywhere and run `./sonodrop`                        |

- Running the AppImage directly needs FUSE 2 (`libfuse2` on Debian/Ubuntu, `fuse2` on Arch); without it, add
  `--appimage-extract-and-run`. The install line above avoids this by unpacking it for you.
- Already downloaded an AppImage? `bash install.sh /path/to/Sonodrop-*.AppImage` installs that file instead of downloading.
- On recent Ubuntu, use the `.deb`: the system restricts apps that aren't installed as packages.

</details>

## What's in it

- **Formats** MP3, FLAC, WAV, OGG, Opus and AAC/M4A directly; ALAC, AIFF, APE, WavPack, TTA, WMA, DSD (DSF/DFF), Musepack,
  MP2, AC3, DTS, CAF, MKA and AMR through ffmpeg.
- **Speakers** the output device is detected (and followed when it changes). On 5.1 / 7.1 / 2.1 systems each speaker gets its own
  channel: stereo music stays in the front pair with its low end sent to the subwoofer (crossover and level adjustable), or is
  spread over every speaker; surround files play speaker-for-speaker.
- **Missing details and artwork** read from file and folder names (`Artist/Album (1999)/03 - Title.flac`), then looked up on
  MusicBrainz and the Cover Art Archive. Can be switched off in Settings; only names are sent, and files are never modified.
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

When the rate chosen in **Sound → Resampling** differs from the device's, Sonodrop hands the audio to the sound
server at that rate directly. What the hardware then receives is the mixer's decision: PipeWire runs everything at
48 kHz unless it is allowed to switch. To let it follow the music:

```
# ~/.config/pipewire/pipewire.conf.d/10-rates.conf
context.properties = {
  default.clock.allowed-rates = [ 44100 48000 88200 96000 176400 192000 ]
}
```

then `systemctl --user restart pipewire pipewire-pulse`. "Device rate" needs none of this: it converts straight
to whatever the mixer is running at.

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
  resampler.ts     decoding of extra formats and SoX resampling, through ffmpeg
  enrich.ts        online lookup of missing details and artwork
  output.ts        output-device detection and the direct (multichannel) sink
src/preload/     the narrow bridge the UI is allowed to call (window.sono)
src/shared/      types and the desktop-widget list, used on both sides
src/renderer/src
  audio/           engine (playback, equaliser, analysis), speaker routing, and the live audio feed visuals read
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
| An audio format   | Add the extension to `NATIVE` or `VIA_FFMPEG` in `main/library.ts`.                              |
| An icon           | Add a path to `components/Icon.tsx`.                                                             |
| A page            | Add a variant to `Route` in `stores/ui.ts` and a case in `App.tsx`.                              |
| A new track field | Add it to `Track`, fill it in `readTrack`, bump `LIBRARY_VERSION` (forces one re-scan).          |

Animations stay smooth through a few rules worth keeping: one shared `requestAnimationFrame` loop
(`lib/ticker.ts`); per-frame visuals write to canvases or `transform`, never React state; the shaders lower
their own resolution when frames run late (`AdaptiveScale` in `fluid/gl.ts`); long lists and the record ring
only keep on-screen items in the DOM.
