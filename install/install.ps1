# Integral One Windows installer bootstrap. Apache-2.0; see LICENSE and NOTICE.
[CmdletBinding()]
param([switch]$Check, [switch]$DownloadOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Receive-IntegralRelease([string]$Uri, [string]$OutFile) {
    # Explicit redirects keep every hop on HTTPS, including Windows PowerShell 5.1.
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = New-Object -TypeName System.Net.Http.HttpClient -ArgumentList $handler
    $client.Timeout = [TimeSpan]::FromMinutes(30)
    $response = $null
    try {
        $current = [Uri]$Uri
        for ($hop = 0; $hop -lt 8; $hop++) {
            if ($current.Scheme -ne 'https' -or $current.UserInfo) { throw 'Release downloads require HTTPS without embedded credentials.' }
            $response = $client.GetAsync($current, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
            if ([int]$response.StatusCode -in @(301, 302, 303, 307, 308)) {
                if (!$response.Headers.Location) { throw 'Invalid download redirect.' }
                $current = New-Object -TypeName Uri -ArgumentList @($current, $response.Headers.Location)
                $response.Dispose(); $response = $null
                continue
            }
            $response.EnsureSuccessStatusCode() | Out-Null
            $stream = [IO.File]::Open($OutFile, [IO.FileMode]::CreateNew)
            try { $response.Content.CopyToAsync($stream).GetAwaiter().GetResult() | Out-Null }
            finally { $stream.Dispose() }
            return
        }
        throw 'Too many download redirects.'
    }
    finally {
        if ($response) { $response.Dispose() }
        $client.Dispose(); $handler.Dispose()
    }
}
function Install-IntegralOne {
    if ($env:OS -ne 'Windows_NT') { throw 'Use the macOS command on Mac. This command supports Windows only.' }
    if ($Check -and $DownloadOnly) { throw 'Choose either -Check or -DownloadOnly.' }
    $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    if ($architecture -ne 'x64') { throw 'This release path supports Windows x64. Native Windows ARM64 is not yet qualified.' }
    # Keep certificate validation enabled. TLS 1.2 is required by the release host.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $base = 'https://github.com/V75inc/integral-one/releases'
    $work = Join-Path ([IO.Path]::GetTempPath()) ('integral-one-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
        Write-Host 'Finding the latest Integral One release...'
        $manifestFile = Join-Path $work 'install-manifest.json'
        try {
            Receive-IntegralRelease "$base/latest/download/install-manifest.json" $manifestFile
            if ((Get-Item -LiteralPath $manifestFile).Length -gt 65536) { throw 'Oversized manifest.' }
            $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
        }
        catch { throw 'No installable release is available, or the download failed. Visit https://github.com/V75inc/integral-one/releases.' }
        if ($manifest.schemaVersion -ne 1 -or $manifest.version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') { throw 'Invalid stable-release manifest.' }
        $version = $manifest.version
        if (!($manifest.artifacts.PSObject.Properties.Name -contains 'win32-x64')) { throw 'A trusted Windows installer has not been published for this release. macOS can be installed separately; check Releases for Windows availability.' }
        $asset = $manifest.artifacts.'win32-x64'
        $file = "integral-one-$version-win-x64.exe"
        if ($asset.file -cne $file -or $asset.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $asset.bytes -le 0 -or $asset.signerThumbprint -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Invalid Windows installer metadata.' }
        if ($Check) { Write-Host "Integral One $version is available for Windows x64. No files installed."; return }
        $download = Join-Path $work $file
        Write-Host "Downloading Integral One $version..."
        Receive-IntegralRelease "$base/download/v$version/$file" $download
        if ((Get-Item -LiteralPath $download).Length -ne $asset.bytes -or (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -cne $asset.sha256) { throw 'Installer download failed its integrity check. Nothing was installed.' }
        $signature = Get-AuthenticodeSignature -LiteralPath $download
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ine $asset.signerThumbprint) { throw 'The installer does not have the expected valid publisher signature.' }
        if ($DownloadOnly) {
            $destination = Join-Path ([Environment]::GetFolderPath('UserProfile')) "Downloads\$file"
            if (Test-Path -LiteralPath $destination) { throw "A download already exists at $destination. Move it before retrying." }
            New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
            Copy-Item -LiteralPath $download -Destination $destination
            Write-Host "Verified installer saved to $destination. No application installed."; return
        }
        if (Get-Process -Name 'Integral One' -ErrorAction SilentlyContinue) { throw 'Quit Integral One, then run this command again. Your workspace will be retained.' }
        $target = Join-Path $env:LOCALAPPDATA 'Programs\Integral One'
        if (Test-Path -LiteralPath $target) {
            if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The installation directory is a link. Use the direct installer.' }
            $existing = Join-Path $target 'Integral One.exe'
            if (!(Test-Path -LiteralPath $existing)) { throw 'The installation directory contains an unexpected application. Use the direct installer.' }
            $oldSignature = Get-AuthenticodeSignature -LiteralPath $existing
            if ($oldSignature.Status -ne 'Valid' -or $oldSignature.SignerCertificate.Subject -cne $signature.SignerCertificate.Subject) { throw 'The existing application has a different or invalid publisher. Use the direct installer for recovery.' }
        }
        Write-Host 'Installing Integral One for your Windows account...'
        # /D must be the final option and has no enclosing quotes in NSIS syntax.
        $process = Start-Process -FilePath $download -ArgumentList "/S /currentuser /D=$target" -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode). Your workspace data was not reset by this script." }
        $app = Join-Path $target 'Integral One.exe'
        if (!(Test-Path -LiteralPath $app)) { throw 'The installer finished but the application was not found. Open Integral One from the Start menu.' }
        $installedSignature = Get-AuthenticodeSignature -LiteralPath $app
        if ($installedSignature.Status -ne 'Valid' -or $installedSignature.SignerCertificate.Thumbprint -ine $asset.signerThumbprint) { throw 'Installed application signature verification failed.' }
        Start-Process -FilePath $app
        Write-Host 'Complete signup in the app. Your workspace files and records stay on this computer.'
    }
    finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
Install-IntegralOne
