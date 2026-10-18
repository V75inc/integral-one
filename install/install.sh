#!/bin/bash
# Integral One macOS installer bootstrap. Apache-2.0; see LICENSE and NOTICE.
# No sudo, package manager, developer tools or security-policy bypasses.
set -euo pipefail
main() {
  check=0; download_only=0
  case "${1:-}" in
    '') ;;
    --check) check=1 ;;
    --download-only) download_only=1 ;;
    *) echo 'Usage: install.sh [--check | --download-only]' >&2; return 1 ;;
  esac
  fail() { echo "Integral One: $*" >&2; exit 1; }
  [ "$(uname -s)" = Darwin ] || fail 'This command supports macOS. Use the PowerShell command on Windows; Linux is not yet qualified.'
  [ "$(id -u)" -ne 0 ] || fail 'Run this command as your normal user, without sudo.'
  installed=0
  arch=$(uname -m)
  # A Terminal running under Rosetta still needs the Apple Silicon build.
  if [ "$(/usr/sbin/sysctl -in hw.optional.arm64 2>/dev/null || true)" = 1 ]; then arch=arm64; fi
  case "$arch" in arm64) platform=darwin-arm64 ;; x86_64) arch=x64; platform=darwin-x64 ;; *) fail 'This Mac architecture is not supported.' ;; esac
  base='https://github.com/V75inc/integral-one/releases'
  work=$(mktemp -d "${TMPDIR:-/tmp}/integral-one-install.XXXXXXXX")
  chmod 700 "$work"
  staging=''; backup=''
  cleanup() {
    # Restore a previous application if replacement failed. Never touch user data.
    if [ -n "$backup" ] && [ -e "$backup" ] && [ "$installed" -eq 0 ] && [ ! -e "$target" ]; then mv "$backup" "$target"; fi
    [ -z "$staging" ] || rm -rf "$staging"
    rm -rf "$work"
  }
  trap cleanup EXIT
  fetch() { /usr/bin/curl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 1800 --retry 2 "$1" -o "$2"; }
  echo 'Finding the latest Integral One release…'
  manifest="$work/install-manifest.json"
  fetch "$base/latest/download/install-manifest.json" "$manifest" || fail 'No installable release is available, or the download failed. Visit https://github.com/V75inc/integral-one/releases.'
  read_value() { /usr/bin/plutil -extract "$1" raw -o - "$manifest" 2>/dev/null; }
  [ "$(read_value schemaVersion)" = 1 ] || fail 'Unsupported release manifest.'
  version=$(read_value version) || fail 'Release version is missing.'
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Only a stable public release can be installed.'
  file=$(read_value "artifacts.$platform.file") || fail 'This release does not have a build for your Mac.'
  [ "$file" = "integral-one-$version-mac-$arch.zip" ] || fail 'Invalid installer filename.'
  expected=$(read_value "artifacts.$platform.sha256") || fail 'Missing download checksum.'
  [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || fail 'Invalid download checksum.'
  team=$(read_value "artifacts.$platform.appleTeamId") || fail 'Missing publisher identity.'
  [[ "$team" =~ ^[A-Z0-9]{10}$ ]] || fail 'Invalid publisher identity.'
  size=$(read_value "artifacts.$platform.bytes") || fail 'Missing download size.'
  [[ "$size" =~ ^[1-9][0-9]*$ ]] || fail 'Invalid download size.'
  if [ "$check" -eq 1 ]; then echo "Integral One $version is available for $platform. No files installed."; return; fi
  echo "Downloading Integral One $version…"
  fetch "$base/download/v$version/$file" "$work/$file" || fail 'Installer download failed. Please retry.'
  [ "$(stat -f %z "$work/$file")" = "$size" ] || fail 'The installer download is incomplete.'
  [ "$(/usr/bin/shasum -a 256 "$work/$file" | /usr/bin/awk '{print $1}')" = "$expected" ] || fail 'Installer checksum mismatch. Nothing was installed.'
  /usr/bin/unzip -Z1 "$work/$file" > "$work/members"
  /usr/bin/awk 'BEGIN {bad=0} /^\// || /(^|\/)\.\.(\/|$)/ || /\\/ {bad=1} !/^Integral One\.app(\/|$)/ {bad=1} END {exit bad}' "$work/members" || fail 'Unexpected installer contents.'
  /usr/bin/ditto -x -k "$work/$file" "$work/unpacked"
  app="$work/unpacked/Integral One.app"
  [ -d "$app" ] && [ ! -L "$app" ] || fail 'The application is missing.'
  [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")" = ai.integral.desktop ] || fail 'Unexpected application identity.'
  [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")" = "$version" ] || fail 'Application version does not match the release.'
  /usr/bin/codesign --verify --deep --strict "$app" || fail 'Publisher signature verification failed.'
  /usr/bin/codesign -dv --verbose=4 "$app" > "$work/signature" 2>&1
  /usr/bin/grep -qx "TeamIdentifier=$team" "$work/signature" || fail 'The publisher does not match the release.'
  /usr/sbin/spctl --assess --type execute "$app" || fail 'macOS did not accept this release. No security settings were changed.'
  if [ "$download_only" -eq 1 ]; then
    parent="$HOME/Downloads"; mkdir -p "$parent"
    target="$parent/$file"
    [ ! -e "$target" ] && [ ! -L "$target" ] || fail "A download already exists at $target. Move it before retrying."
    cp "$work/$file" "$target"
    echo "Verified installer saved to $target. No application installed."; return
  fi
  parent="$HOME/Applications"; target="$parent/Integral One.app"
  [ ! -L "$parent" ] && [ ! -L "$target" ] || fail 'The installation location is a symbolic link; please use the direct installer.'
  mkdir -p "$parent"
  if /usr/bin/pgrep -x 'Integral One' >/dev/null; then fail 'Quit Integral One, then run this command again. Your workspace will be retained.'; fi
  # Prepare the complete verified bundle on the destination filesystem first.
  staging=$(mktemp -d "$parent/.integral-one-install.XXXXXXXX")
  /usr/bin/ditto "$app" "$staging/Integral One.app"
  /usr/bin/codesign --verify --deep --strict "$staging/Integral One.app" || fail 'Installed copy failed integrity verification.'
  if [ -e "$target" ]; then
    [ -d "$target" ] || fail 'The application location is occupied by another file.'
    [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$target/Contents/Info.plist")" = ai.integral.desktop ] || fail 'The existing application has a different identity.'
    backup="$staging/previous.app"; mv "$target" "$backup"
  fi
  mv "$staging/Integral One.app" "$target"
  installed=1
  echo 'Installed. Opening Integral One…'
  /usr/bin/open "$target" || fail "Installed at $target. Open it from Finder to finish setup."
  echo 'Complete signup in the app. Your workspace files and records stay on this computer.'
}
# The function must be fully downloaded and parsed before any install action runs.
main "$@"
