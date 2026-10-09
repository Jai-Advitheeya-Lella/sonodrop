#!/usr/bin/env bash
# Installs Sonodrop for the current user. No root, nothing outside your home folder.
#
#   Install or update:   curl -fsSL https://raw.githubusercontent.com/Jai-Advitheeya-Lella/sonodrop/master/install.sh | bash
#   From a file you have: bash install.sh /path/to/Sonodrop-x86_64.AppImage
#   Remove:               bash install.sh --uninstall
#
# It unpacks the app into ~/.local/share/sonodrop and adds it to your application menu.
# Works on ordinary and immutable distros alike (Bazzite, Silverblue, SteamOS, Ubuntu, Fedora, Arch…).
set -euo pipefail

REPO="Jai-Advitheeya-Lella/sonodrop"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DIR="$DATA/sonodrop"
BIN="$HOME/.local/bin/sonodrop"
ENTRY="$DATA/applications/sonodrop.desktop"

say() { printf '\033[1;36m%s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$APP_DIR" "$BIN" "$ENTRY"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true
  say "Sonodrop is removed. Your library and settings are still in ~/.config/sonodrop (delete that folder to forget them too)."
  exit 0
fi

[ "$(uname -s)" = "Linux" ] || fail "Sonodrop runs on Linux only."
[ "$(uname -m)" = "x86_64" ] || fail "Sonodrop is built for 64-bit Intel/AMD computers; this one is $(uname -m)."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
image="$work/Sonodrop.AppImage"

if [ -n "${1:-}" ]; then
  [ -f "$1" ] || fail "Can't find the file: $1"
  cp "$1" "$image"
else
  command -v curl >/dev/null 2>&1 || fail "This needs 'curl' to download Sonodrop. Install curl and run it again."
  say "Looking for the latest Sonodrop…"
  url="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -o '"browser_download_url": *"[^"]*\.AppImage"' | head -n 1 | sed 's/.*"\(https[^"]*\)"/\1/')" || true
  [ -n "${url:-}" ] || fail "Couldn't find a download at https://github.com/$REPO/releases — check your internet connection and try again."
  say "Downloading $(basename "$url")…"
  curl -fL --progress-bar "$url" -o "$image"
fi

say "Installing into $APP_DIR…"
chmod +x "$image"
# Unpacking (instead of running the AppImage as it is) means it needs no FUSE and starts faster.
(cd "$work" && "$image" --appimage-extract >/dev/null)
[ -x "$work/squashfs-root/AppRun" ] || fail "That file doesn't look like a Sonodrop AppImage."
rm -rf "$APP_DIR"
mkdir -p "$DATA/applications" "$(dirname "$BIN")"
mv "$work/squashfs-root" "$APP_DIR"

icon="$APP_DIR/usr/share/icons/hicolor/512x512/apps/sonodrop.png"
[ -f "$icon" ] || icon="$APP_DIR/.DirIcon"

cat > "$BIN" <<EOF
#!/bin/sh
exec "$APP_DIR/AppRun" "\$@"
EOF
chmod +x "$BIN"

cat > "$ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=Sonodrop
GenericName=Music Player
Comment=A liquid local music player
Exec="$APP_DIR/AppRun" %U
Icon=$icon
Terminal=false
Categories=AudioVideo;Audio;Player;
Keywords=music;audio;player;flac;mp3;equalizer;
StartupWMClass=sonodrop
EOF
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true

say "Done. Sonodrop is in your application menu (it can take a moment to show up)."
echo "You can also start it from a terminal with: $BIN"
echo
# Two optional helpers; Sonodrop works without them, with fewer features.
command -v ffmpeg >/dev/null 2>&1 || echo "Optional: install 'ffmpeg' to play ALAC, AIFF, APE, WavPack, WMA and DSD files, and for resampling."
command -v pacat >/dev/null 2>&1 || echo "Optional: install 'pulseaudio-utils' to use surround speakers and a subwoofer."
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" = "1" ]; then
  echo "Note: this system (recent Ubuntu) restricts apps installed this way. If Sonodrop doesn't open,"
  echo "      install the .deb from https://github.com/$REPO/releases instead."
fi
