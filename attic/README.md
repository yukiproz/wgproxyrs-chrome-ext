# Attic — the standalone-Windows route (superseded for Hadi's setup)

This folder holds v0.1's approach: a PowerShell Native Messaging host plus
installers that bundle a Windows build of `wgproxyrs.exe` with the
extension, for a machine with **no WSL**.

It was retired on 2026-11-09 for a simple reason: Hadi's Edge runs on
Windows, but his wgproxyrs already runs in WSL on the same machine, and
WSL2 exposes WSL localhost services as Windows localhost. The extension
therefore just points at the WSL engine's ports directly (SOCKS5 1080,
HTTP 1081, status 1082) — no native host, no Windows binary, no registry
registration. See the main README.

Kept for reference (and in case a WSL-less Windows install is ever wanted).
Not wired into the extension, not covered by CI.
