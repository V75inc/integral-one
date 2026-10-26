#!/bin/bash
# Integral One macOS installer bootstrap. Apache-2.0; see LICENSE and NOTICE.
# No sudo, package manager, developer tools or security-policy bypasses.
set -euo pipefail
main() {
  check=0; download_only=0; channel=stable
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --check) check=1 ;;
      --download-only) download_only=1 ;;
      --channel) shift; channel=${1:-} ;;
      *) echo 'Usage: install.sh [--channel stable|development] [--check | --download-only]' >&2; return 1 ;;
    esac
    shift
  done
  fail() { echo "Integral One: $*" >&2; exit 1; }
  newer_version() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | /usr/bin/sort -t. -k1,1n -k2,2n -k3,3n | /usr/bin/tail -n 1)" = "$1" ]; }
  case "$channel" in stable) registry=pypi; index=https://pypi.org ;; development) registry=testpypi; index=https://test.pypi.org ;; *) fail 'Choose the stable or development channel.' ;; esac
  [ "$check" -eq 0 ] || [ "$download_only" -eq 0 ] || fail 'Choose --check or --download-only.'
  [ "$(uname -s)" = Darwin ] || fail 'This command supports macOS. Use the PowerShell command on Windows; Linux is not yet qualified.'
  [ "$(id -u)" -ne 0 ] || fail 'Run this command as your normal user, without sudo.'
  mac_version=$(/usr/bin/sw_vers -productVersion)
  mac_major=${mac_version%%.*}
  [[ "$mac_major" =~ ^[0-9]+$ ]] && [ "$mac_major" -ge 14 ] || fail 'This runtime requires macOS 14 or newer.'
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
  manifest_url="$base/latest/download/install-manifest.json"
  if [ "$channel" = development ]; then
    fetch 'https://api.github.com/repos/V75inc/integral-one/releases?per_page=30' "$work/releases.json" || fail 'Could not check development releases.'
    [ "$(stat -f %z "$work/releases.json")" -le 2097152 ] || fail 'Oversized release index.'
    manifest_url=''; selected_version=0.0.0; i=0
    while [ "$i" -lt 30 ]; do
      tag=$(/usr/bin/plutil -extract "$i.tag_name" raw -o - "$work/releases.json" 2>/dev/null) || break
      draft=$(/usr/bin/plutil -extract "$i.draft" raw -o - "$work/releases.json")
      prerelease=$(/usr/bin/plutil -extract "$i.prerelease" raw -o - "$work/releases.json")
      if [ "$draft" = false ] && [ "$prerelease" = true ] && [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        j=0; has_manifest=0; has_installer=0
        while [ "$j" -lt 100 ]; do
          name=$(/usr/bin/plutil -extract "$i.assets.$j.name" raw -o - "$work/releases.json" 2>/dev/null) || break
          [ "$name" != install-manifest.json ] || has_manifest=1
          [ "$name" != "integral-one-${tag#v}-mac-$arch.zip" ] || has_installer=1
          j=$((j+1))
        done
        if [ "$has_manifest" -eq 1 ] && [ "$has_installer" -eq 1 ] && newer_version "${tag#v}" "$selected_version"; then
          manifest_url="$base/download/$tag/install-manifest.json"; selected_version=${tag#v}
        fi
      fi
      i=$((i+1))
    done
    [ -n "$manifest_url" ] || fail 'No signed development installer has been published yet.'
  fi
  fetch "$manifest_url" "$manifest" || fail 'No installable release is available, or the download failed. Visit https://github.com/V75inc/integral-one/releases.'
  [ "$(stat -f %z "$manifest")" -le 65536 ] || fail 'Oversized installer manifest.'
  read_value() { /usr/bin/plutil -extract "$1" raw -o - "$manifest" 2>/dev/null; }
  [ "$(read_value schemaVersion)" = 2 ] || fail 'Unsupported release manifest.'
  [ "$(read_value channel)" = "$channel" ] && [ "$(read_value core.registry)" = "$registry" ] || fail 'The installer does not match the selected release channel.'
  core_version=$(read_value core.version) || fail 'Core version is missing.'
  core_hash=$(read_value core.wheelSha256) || fail 'Core checksum is missing.'
  [[ "$core_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+((a|b|rc)[0-9]+)?$ ]] && [[ "$core_hash" =~ ^[a-f0-9]{64}$ ]] || fail 'Invalid Core release identity.'
  if [ "$channel" = stable ]; then [[ "$core_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Stable installers cannot include a Core release candidate.'; fi
  fetch "$index/pypi/integral-core/$core_version/json" "$work/core.json" || fail 'The selected Core release is not published on the selected package index.'
  [ "$(stat -f %z "$work/core.json")" -le 1048576 ] || fail 'Oversized Core publication metadata.'
  matches=0; i=0
  while [ "$i" -lt 100 ]; do
    name=$(/usr/bin/plutil -extract "urls.$i.filename" raw -o - "$work/core.json" 2>/dev/null) || break
    if [ "$name" = "integral_core-$core_version-py3-none-any.whl" ] &&
       [ "$(/usr/bin/plutil -extract "urls.$i.yanked" raw -o - "$work/core.json")" = false ] &&
       [ "$(/usr/bin/plutil -extract "urls.$i.digests.sha256" raw -o - "$work/core.json")" = "$core_hash" ]; then matches=$((matches+1)); fi
    i=$((i+1))
  done
  [ "$matches" -eq 1 ] || fail 'The installer Core pin does not match its package publication.'
  version=$(read_value version) || fail 'Release version is missing.'
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Only a stable public release can be installed.'
  file=$(read_value "artifacts.$platform.file") || fail 'This release does not have a build for your Mac.'
  [ "$file" = "integral-one-$version-mac-$arch.zip" ] || fail 'Invalid installer filename.'
  expected=$(read_value "artifacts.$platform.sha256") || fail 'Missing download checksum.'
  [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || fail 'Invalid download checksum.'
  team=$(read_value "artifacts.$platform.appleTeamId") || fail 'Missing publisher identity.'
  [ "$team" = M43V972XU9 ] || fail 'This release is not from the approved V75 publisher.'
  size=$(read_value "artifacts.$platform.bytes") || fail 'Missing download size.'
  [[ "$size" =~ ^[1-9][0-9]*$ ]] || fail 'Invalid download size.'
  if [ "$check" -eq 1 ]; then echo "Integral One $version with Core $core_version is available for $platform ($channel). No files installed."; return; fi
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
    previous=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$target/Contents/Info.plist")
    [[ "$previous" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Cannot verify the installed version; use the app updater.'
    if newer_version "$previous" "$version"; then fail 'A newer Integral One is already installed. A downgrade could make your workspace incompatible.'; fi
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
