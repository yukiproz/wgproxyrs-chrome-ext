# Attic — the bundled-helper route (superseded)

This folder holds v0.1's approach: a PowerShell Native Messaging host plus
installers that bundle a Windows build of `wgproxyrs.exe` with the
extension, for a machine where the engine does not already run locally.

It was retired on 2026-11-09 for a simple reason: wgproxyrs already runs
locally on the same machine as the browser, bound to localhost, so the
extension just points at the engine's ports directly (SOCKS5 1080,
HTTP 1081, status 1082) — no native host, no bundled binary, no registry
registration. See the main README.

Kept for reference (and in case a bundled Windows install is ever wanted).
Not wired into the extension, not covered by CI.
