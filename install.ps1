# wgproxyrs extension - Windows installer (Edge first, Chrome as bonus).
# Run once from the extracted bundle folder:
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
# What it does:
#   1. Generates native-host\com.wgproxyrs.host.json pointing at this folder.
#   2. Registers it under HKCU for Microsoft Edge (and Chrome, if you use it).
# It does NOT install anything system-wide and touches no other settings.
param(
    [string]$ExtensionId = 'nbnpddcaocfcbamihlibbgidlebajcbl'
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$templatePath = Join-Path $root 'native-host\com.wgproxyrs.host.json.template'
$manifestPath = Join-Path $root 'native-host\com.wgproxyrs.host.json'
$json = (Get-Content -LiteralPath $templatePath -Raw).Replace('__BUNDLE_ROOT__', $root)
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Native host manifest written: $manifestPath"

foreach ($browser in @('Microsoft\Edge', 'Google\Chrome')) {
    $key = "HKCU\Software\$browser\NativeMessagingHosts\com.wgproxyrs.host"
    & reg.exe add $key /ve /t REG_SZ /d $manifestPath /f | Out-Null
    Write-Host "Registered native host for $browser"
}

Write-Host ''
Write-Host 'Next steps in Edge:'
Write-Host '  1. Open edge://extensions and enable Developer mode.'
Write-Host "  2. Click 'Load unpacked' and select: $(Join-Path $root 'extension')"
Write-Host "  3. The extension ID should be $ExtensionId (pinned by the manifest key)."
Write-Host '  4. Open the wgproxyrs popup, import a .conf, and Connect.'
