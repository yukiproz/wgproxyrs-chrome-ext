# DESIGN — wgproxyrs browser extension (draft)

## The UDP wall

WireGuard = encrypted UDP packets to the peer endpoint. A browser extension
(MV3, Edge/Chromium/Chrome alike) has: no raw sockets, no UDP sockets, no
ability to execute bundled native code. WebTransport/WebRTC do not provide
general UDP to arbitrary endpoints either. Conclusion: the tunnel engine
must live outside the browser. This is the same reason commercial WireGuard
clients are native apps with a UI bolted on, not extensions.

## Split of responsibilities

| Part | Runs where | Does |
|---|---|---|
| Popup + background worker (MV3) | Edge | File picking, config summary for display, Connect/Disconnect, `chrome.proxy` set/clear, status polling |
| Native host (`wgproxyrs-host.ps1` + `.bat` launcher) | Windows, per-message process | Persists profiles, starts/stops the engine process, probes status |
| wgproxyrs.exe | Windows, hidden process | The actual tunnel: SOCKS5 on 127.0.0.1:1080, health on 127.0.0.1:1182 |

## Decisions (Hadi, 2026-11-09)

- **Multi-profile**: import as many `.conf` files as you like; one active
  tunnel at a time.
- **Persistent configs, manual delete**: disconnect keeps the profile file.
  Deletion is an explicit user action (popup button or deleting the file).
  Keep it simple — no auto-shredding, no expiry.
- **Target: Edge on Windows.** Chrome/Chromium registration is a free bonus
  in `install.ps1`; Linux is out of scope for the draft.
- **Self-contained bundle**: one zip from GitHub Actions contains the
  extension, the engine exe built from source, the host, and the installer.
  The binary is an artifact, never a git blob.
- **Portable layout**: everything (profiles, state, logs) lives inside the
  bundle folder the user chose; the only outside footprint is the per-user
  (HKCU) Native Messaging registration and the unpacked extension in Edge.

## Message protocol (extension ↔ host)

One JSON object per Native Messaging frame, one process per message
(`sendNativeMessage`). Commands: `import {name, configText}`,
`list`, `delete {name}`, `start {name}`, `stop`, `status`.
Replies: `{ok: true, ...}` or `{ok: false, error}`. `status` adds
`state: up|down|unreachable` (mapped from the engine probe's exit code)
and `activeProfile`. Secret fields (`PrivateKey`, `PresharedKey`) are never
echoed back.

## Process ownership on Windows

The host starts the engine with `Start-Process -WindowStyle Hidden` and
records `{profile, pid}` in `state\active.json`. Stop kills **by that PID
only**. The engine's Unix `--daemon`/`--pidfile` flags are deliberately not
used on Windows; the host is the supervisor. The browser proxy is cleared
*before* the engine is stopped, and set only *after* the engine process
exists — so the browser never points at a missing proxy, and wgproxyrs'
fail-closed proxy covers the tunnel-down window.

## Extension identity

`manifest.json` carries a fixed `key`, pinning the unpacked extension ID to
`nbnpddcaocfcbamihlibbgidlebajcbl`. The matching private key was generated
for this draft and intentionally **not** committed or retained; ID stability
for unpacked use only needs the public key. Store publishing later can
generate its own signing identity.

## Threat notes (draft-level)

- Anyone who can read the bundle folder can read your WireGuard private
  keys — same trust level as keeping `.conf` files in a folder, which is
  the accepted model for this draft.
- The native host only accepts connections from the pinned extension ID
  (`allowed_origins` in the generated host manifest).
- Profile names are validated (`^[A-Za-z0-9._-]+$`) before touching the
  filesystem; path traversal is refused and covered by the host test.
