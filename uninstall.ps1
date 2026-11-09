# wgproxyrs extension - Windows uninstaller.
#   powershell -ExecutionPolicy Bypass -File .\uninstall.ps1          (keeps profiles)
#   powershell -ExecutionPolicy Bypass -File .\uninstall.ps1 -Purge   (also deletes profiles + state)
param([switch]$Purge)
$ErrorActionPreference = 'Stop'
foreach ($browser in @('Microsoft\Edge', 'Google\Chrome')) {
    & reg.exe delete "HKCU\Software\$browser\NativeMessagingHosts\com.wgproxyrs.host" /f 2>$null | Out-Null
    Write-Host "Unregistered native host for $browser"
}
if ($Purge) {
    foreach ($dir in @('profiles', 'state')) {
        $path = Join-Path $PSScriptRoot $dir
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
    }
    Write-Host 'Profiles and state deleted.'
} else {
    Write-Host 'Profiles kept (delete the profiles folder manually any time).'
}
Write-Host 'Remove the extension itself from edge://extensions.'
