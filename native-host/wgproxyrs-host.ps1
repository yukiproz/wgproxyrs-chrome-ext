# wgproxyrs native messaging host (Windows / PowerShell 5.1+, also runs on pwsh).
# Protocol: Chrome Native Messaging - 4-byte little-endian length + UTF-8 JSON,
# one message per process invocation (matches chrome.runtime.sendNativeMessage).
# The host owns the wgproxyrs process directly (Start-Process + PID in state),
# because the engine's Unix-style --daemon/--pidfile flags are not used on Windows.
$ErrorActionPreference = 'Stop'

function Get-BundleRoot {
    if ($env:WGPROXYRS_EXT_HOME) { return $env:WGPROXYRS_EXT_HOME }
    # This script lives in <bundle>\native-host\; the bundle root is one level up.
    return (Split-Path -Parent $PSScriptRoot)
}

function Ensure-Dir([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
    return $Path
}

function Assert-ValidName([string]$Name) {
    if ($Name -notmatch '^[A-Za-z0-9._-]+$' -or $Name -eq '.' -or $Name -eq '..') {
        throw "invalid profile name: $Name"
    }
}

function Read-ProfileSummary([string]$Path, [string]$Name) {
    $address = @(); $dns = @(); $hasPrivateKey = $false; $peers = @()
    $section = ''; $peer = $null
    foreach ($raw in [System.IO.File]::ReadAllLines($Path)) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith('#') -or $line.StartsWith(';')) { continue }
        if ($line -match '^\[(.+)\]$') {
            $section = $Matches[1].Trim().ToLower()
            if ($section -eq 'peer') {
                $peer = [ordered]@{ endpoint = $null; allowedIPs = @() }
                $peers += $peer
            }
            continue
        }
        $idx = $line.IndexOf('=')
        if ($idx -lt 0) { continue }
        $key = $line.Substring(0, $idx).Trim().ToLower()
        $value = $line.Substring($idx + 1).Trim()
        if ($section -eq 'interface') {
            if ($key -eq 'address') { $address = @($value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
            elseif ($key -eq 'dns') { $dns = @($value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
            elseif ($key -eq 'privatekey') { $hasPrivateKey = ($value.Length -gt 0) }
        } elseif ($section -eq 'peer' -and $null -ne $peer) {
            if ($key -eq 'endpoint') { $peer.endpoint = $value }
            elseif ($key -eq 'allowedips') { $peer.allowedIPs = @($value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
            # PresharedKey is a secret: it is never read into any output.
        }
    }
    return [ordered]@{ name = $Name; address = $address; dns = $dns; hasPrivateKey = $hasPrivateKey; peers = $peers }
}

function Find-Binary([string]$Root) {
    if ($env:WGPROXYRS_BIN -and (Test-Path -LiteralPath $env:WGPROXYRS_BIN)) { return $env:WGPROXYRS_BIN }
    $bundled = Join-Path $Root 'bin\wgproxyrs.exe'
    if (Test-Path -LiteralPath $bundled) { return $bundled }
    $bundledUnix = Join-Path $Root 'bin/wgproxyrs'
    if (Test-Path -LiteralPath $bundledUnix) { return $bundledUnix }
    $cmd = Get-Command 'wgproxyrs' -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Get-Active([string]$StateDir) {
    $file = Join-Path $StateDir 'active.json'
    if (-not (Test-Path -LiteralPath $file)) { return $null }
    try { return (Get-Content -LiteralPath $file -Raw | ConvertFrom-Json) } catch { return $null }
}

function Test-PidAlive([int]$ProcessId) {
    return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Invoke-Dispatch($Msg) {
    $root = Get-BundleRoot
    $profilesDir = Ensure-Dir (Join-Path $root 'profiles')
    $stateDir = Ensure-Dir (Join-Path $root 'state')
    switch ($Msg.cmd) {
        'import' {
            Assert-ValidName $Msg.name
            if (-not $Msg.configText -or $Msg.configText -notmatch '\[Interface\]') { throw 'config has no [Interface] section' }
            $path = Join-Path $profilesDir ($Msg.name + '.conf')
            # Persistent by design (Hadi's call): the file stays until the user
            # deletes it manually. On Windows the bundle folder is user-owned;
            # on POSIX the host test asserts mode 0600 where the OS supports it.
            [System.IO.File]::WriteAllText($path, $Msg.configText, (New-Object System.Text.UTF8Encoding($false)))
            return [ordered]@{ ok = $true; profile = (Read-ProfileSummary $path $Msg.name) }
        }
        'list' {
            $profiles = @()
            foreach ($f in (Get-ChildItem -LiteralPath $profilesDir -Filter '*.conf' -ErrorAction SilentlyContinue | Sort-Object Name)) {
                $profiles += (Read-ProfileSummary $f.FullName $f.BaseName)
            }
            return [ordered]@{ ok = $true; profiles = $profiles }
        }
        'delete' {
            Assert-ValidName $Msg.name
            $active = Get-Active $stateDir
            if ($active -and $active.profile -eq $Msg.name -and (Test-PidAlive ([int]$active.pid))) {
                throw 'profile is active - disconnect first'
            }
            $path = Join-Path $profilesDir ($Msg.name + '.conf')
            if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
            return [ordered]@{ ok = $true }
        }
        'start' {
            Assert-ValidName $Msg.name
            $bin = Find-Binary $root
            if (-not $bin) { throw 'wgproxyrs binary not found (expected in bundle bin\ folder)' }
            $active = Get-Active $stateDir
            if ($active -and (Test-PidAlive ([int]$active.pid))) { throw "already running (profile $($active.profile))" }
            $conf = Join-Path $profilesDir ($Msg.name + '.conf')
            if (-not (Test-Path -LiteralPath $conf)) { throw "profile not found: $($Msg.name)" }
            $outLog = Join-Path $stateDir 'wgproxyrs.out.log'
            $errLog = Join-Path $stateDir 'wgproxyrs.err.log'
            $proc = Start-Process -FilePath $bin -ArgumentList @('--config', $conf, '--bind', '127.0.0.1:1080', '--info-bind', '127.0.0.1:1182') -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
            Start-Sleep -Milliseconds 400
            if ($proc.HasExited) { throw "wgproxyrs exited immediately (code $($proc.ExitCode)); see state\wgproxyrs.err.log" }
            $state = [ordered]@{ profile = $Msg.name; pid = $proc.Id }
            [System.IO.File]::WriteAllText((Join-Path $stateDir 'active.json'), ($state | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
            return [ordered]@{ ok = $true; pid = $proc.Id; profile = $Msg.name }
        }
        'stop' {
            $active = Get-Active $stateDir
            if ($active -and (Test-PidAlive ([int]$active.pid))) {
                Stop-Process -Id ([int]$active.pid) -Force -ErrorAction SilentlyContinue
            }
            $file = Join-Path $stateDir 'active.json'
            if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
            return [ordered]@{ ok = $true }
        }
        'status' {
            $active = Get-Active $stateDir
            if (-not $active -or -not (Test-PidAlive ([int]$active.pid))) {
                return [ordered]@{ ok = $true; state = 'unreachable'; activeProfile = $null }
            }
            $bin = Find-Binary $root
            if (-not $bin) { return [ordered]@{ ok = $true; state = 'down'; activeProfile = $active.profile } }
            $probe = Start-Process -FilePath $bin -ArgumentList @('status', '--info', '127.0.0.1:1182') -NoNewWindow -Wait -PassThru
            $stateName = switch ($probe.ExitCode) { 0 { 'up' } 1 { 'down' } default { 'unreachable' } }
            return [ordered]@{ ok = $true; state = $stateName; activeProfile = $active.profile }
        }
        default { throw "unknown cmd: $($Msg.cmd)" }
    }
}

# --- Native Messaging framing: read one message, write one reply, exit. ---
$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()
try {
    $lenBuf = New-Object byte[] 4
    $read = 0
    while ($read -lt 4) {
        $n = $stdin.Read($lenBuf, $read, 4 - $read)
        if ($n -le 0) { exit 0 }
        $read += $n
    }
    $len = [BitConverter]::ToInt32($lenBuf, 0)
    if ($len -le 0 -or $len -gt 1048576) { throw "invalid message length: $len" }
    $buf = New-Object byte[] $len
    $read = 0
    while ($read -lt $len) {
        $n = $stdin.Read($buf, $read, $len - $read)
        if ($n -le 0) { throw 'unexpected EOF from browser' }
        $read += $n
    }
    $msg = [System.Text.Encoding]::UTF8.GetString($buf) | ConvertFrom-Json
    $response = Invoke-Dispatch $msg
} catch {
    $response = [ordered]@{ ok = $false; error = $_.Exception.Message }
}
$json = $response | ConvertTo-Json -Compress -Depth 8
$outBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$outLen = [BitConverter]::GetBytes([int]$outBytes.Length)
$stdout.Write($outLen, 0, 4)
$stdout.Write($outBytes, 0, $outBytes.Length)
$stdout.Flush()
