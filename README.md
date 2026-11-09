# wgproxyrs-chrome-ext

A browser face for [wgproxyrs](https://github.com/yukiproz/wgproxyrs) — the
userspace WireGuard client in Rust that exposes a local SOCKS5/HTTP proxy.
Target browsers: **Chromium and Microsoft Edge**, with the engine running
locally on the same machine — however you run it (native binary, terminal,
service, VM): if it answers on localhost, this extension can drive it.

Current version: **v0.3.2** (configurable ports, Set-with-read-back).

## How it works — deliberately simple

wgproxyrs binds its proxy and status ports to localhost, so the browser
can reach it directly. No native messaging host, no bundled engine, no
installer:

```
Browser                                     This machine
┌─────────────────────────────┐            ┌──────────────────────────┐
│ extension                   │  proxy     │ wgproxyrs                │
│  - Connect: set proxy ──────┼──127.0.0.1:1080 (SOCKS5)           │
│                             ├──127.0.0.1:1081 (HTTP CONNECT)     │
│  - Status: GET / ───────────┼──127.0.0.1:1082 (health JSON)      │
│  - WebRTC leak policy on    │            │   tunnel to your .conf   │
└─────────────────────────────┘            └──────────────────────────┘
```

Default ports are the tidy sequence: SOCKS5 **1080**, HTTP **1081**,
status **1082** — but all three are **configurable in the popup** and
persisted in the extension, so they can match however you started
wgproxyrs. Pressing **Set ports** applies them and the popup shows a
confirmation read back from the system (the stored ports plus
`chrome.proxy.settings.get`), not just the form values. The status probe
tries the configured port first, then the legacy **1182** so older
running instances still answer.

## Use

1. Start the engine locally (config and profile management live with the
   engine — multi-profile just means running the instance you want):

   ```bash
   wgproxyrs --config uner.conf --bind 127.0.0.1:1080 --http-bind 127.0.0.1:1081 --info-bind 127.0.0.1:1082
   ```

2. In the browser: `chrome://extensions` (or `edge://extensions`) →
   Developer mode → **Load unpacked** → select this repo's `extension/`
   folder (or unzip the CI artifact).
3. Click the wgproxyrs icon. The popup shows the tunnel state from the
   status endpoint. Pick SOCKS5 (1080) or HTTP (1081) and **Connect** —
   the extension sets the browser proxy and disables non-proxied WebRTC
   UDP (`disable_non_proxied_udp`) so WebRTC cannot leak around the proxy.
4. **Disconnect** clears the browser proxy and restores the WebRTC
   default. The local wgproxyrs keeps running; stop it when you are done.

If the engine is not reachable, Connect refuses with an explanation
instead of pointing the browser at a dead proxy. If the browser restarts
while connected and the engine is gone, the stale proxy is cleared on
startup. wgproxyrs itself is fail-closed, so a down tunnel refuses
traffic rather than leaking it outside the tunnel.

## What the extension cannot do (by design)

- Start/stop wgproxyrs or manage `.conf` files — that stays with the
  engine, where the configs already live. This is the same split as the
  well-known VPN extensions (see DESIGN.md's prior-art audit):
  extension = face + proxy switch, local side = tunnel.
- A pure extension could never speak WireGuard anyway (no UDP in MV3);
  v0.1 of this repo explored pairing the extension with a Native
  Messaging helper app. That work is kept in `attic/` for reference.

## Development

- `node tests/manifest.test.mjs` — manifest contract (notably: **no**
  `nativeMessaging` permission; the only host permission is loopback,
  any port).
- CI (`.github/workflows/ci.yml`): syntax + manifest validation, then a
  zipped extension artifact (`wgproxyrs-ext`).
