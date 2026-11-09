# wgproxyrs-chrome-ext

A browser face for [wgproxyrs](https://github.com/yukiproz/wgproxyrs) — the
userspace WireGuard client in Rust that exposes a local SOCKS5/HTTP proxy.
Target browser: **Microsoft Edge on Windows**, with the engine running in
**WSL** on the same machine.

Current version: **v0.2.0** (the WSL-localhost edition).

## How it works — deliberately simple

WSL2 exposes services bound to localhost inside WSL as `localhost` on
Windows. wgproxyrs already runs in WSL, so Edge can reach it directly.
No native messaging host, no Windows build of the engine, no installer:

```
Edge (Windows)                              WSL
┌─────────────────────────────┐            ┌──────────────────────────┐
│ extension                   │  proxy     │ wgproxyrs                │
│  - Connect: set proxy ──────┼──127.0.0.1:1080 (SOCKS5)           │
│                             ├──127.0.0.1:1081 (HTTP CONNECT)     │
│  - Status: GET / ───────────┼──127.0.0.1:1182 (health JSON)      │
│  - WebRTC leak policy on    │            │   tunnel to your .conf   │
└─────────────────────────────┘            └──────────────────────────┘
```

Ports are the standing convention on Hadi's machine: SOCKS5 **1080**,
HTTP **1081**, status **1182**.

## Use

1. In WSL, start the engine (config and profile management live here —
   multi-profile just means running the instance you want):

   ```bash
   wgproxyrs --config uner.conf --bind 127.0.0.1:1080 --http-bind 127.0.0.1:1081 --info-bind 127.0.0.1:1182
   ```

2. In Edge: `edge://extensions` → Developer mode → **Load unpacked** →
   select this repo's `extension/` folder (or unzip the CI artifact).
3. Click the wgproxyrs icon. The popup shows the tunnel state from the
   status endpoint. Pick SOCKS5 (1080) or HTTP (1081) and **Connect** —
   the extension sets Edge's proxy and disables non-proxied WebRTC UDP
   (`disable_non_proxied_udp`) so WebRTC cannot leak around the proxy.
4. **Disconnect** clears Edge's proxy and restores the WebRTC default.
   wgproxyrs in WSL keeps running; stop it there when you are done.

If the engine is not reachable, Connect refuses with an explanation
instead of pointing the browser at a dead proxy. If Edge restarts while
connected and the engine is gone, the stale proxy is cleared on startup.
wgproxyrs itself is fail-closed, so a down tunnel refuses traffic rather
than leaking it outside the tunnel.

## What the extension cannot do (by design)

- Start/stop wgproxyrs or manage `.conf` files — that stays in WSL,
  where the engine and configs already live. This is the same split as
  the well-known VPN extensions (see DESIGN.md's prior-art audit):
  extension = face + proxy switch, native side = tunnel.
- A pure extension could never speak WireGuard anyway (no UDP in MV3);
  v0.1 of this repo explored the Native Messaging route for WSL-less
  Windows machines. That work is kept in `attic/` for reference.

## Development

- `node tests/manifest.test.mjs` — manifest contract (notably: **no**
  `nativeMessaging` permission; the only host permission is the status
  endpoint).
- CI (`.github/workflows/ci.yml`): syntax + manifest validation, then a
  zipped extension artifact (`wgproxyrs-ext`).
