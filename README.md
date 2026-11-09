# wgproxyrs-chrome-ext (DRAFT)

A browser face for [wgproxyrs](https://github.com/yukiproz/wgproxyrs) — the
userspace WireGuard client in Rust that exposes a local SOCKS5/HTTP proxy.
Target browser: **Microsoft Edge on Windows** (the same MV3 code also loads in
Chromium/Chrome).

Status: **draft v0.1.0** — scaffold + working plumbing, not a polished product.

## Why the extension cannot be self-contained on its own

A pure browser extension **cannot** speak WireGuard:

- WireGuard's transport is **UDP**. MV3 extensions get no raw UDP sockets —
  not directly, and not via WebAssembly either.
- An extension package also cannot ship and execute a native binary; the
  browser sandbox forbids running bundled executables.

So every real product in this class uses the same split, and so do we:

```
Edge popup (face) --Native Messaging--> PowerShell host --starts--> wgproxyrs.exe
       |                                                              |
       +-- chrome.proxy: SOCKS5 127.0.0.1:1080 <----------------------+
       Only this browser's traffic rides the tunnel. Nothing system-wide changes.
```

**The self-contained unit is the bundle, not the extension.** GitHub Actions
builds `wgproxyrs.exe` from source and packs one zip:

```
wgproxyrs-ext\
  extension\      MV3 extension (load unpacked, once)
  bin\wgproxyrs.exe
  native-host\    PowerShell host + manifest template
  install.ps1     registers the native host for Edge (HKCU, per-user)
  uninstall.ps1
  profiles\       your imported .conf files (created on first import)
  state\          active profile + logs (created on first connect)
```

No separate wgproxyrs install, no Python, no admin rights. PowerShell 5.1
ships with Windows and runs the host.

## Install (Windows, Edge)

1. Download the `wgproxyrs-ext-windows` artifact from the latest green
   [Actions run](../../actions) and unzip it where you want to keep it
   (the folder is portable — profiles and state live inside it).
2. In the unzipped folder:
   `powershell -ExecutionPolicy Bypass -File .\install.ps1`
3. In Edge: `edge://extensions` → Developer mode → **Load unpacked** →
   select the `extension` folder. The extension ID is pinned by the
   manifest `key` to `nbnpddcaocfcbamihlibbgidlebajcbl`, which is what
   `install.ps1` registers the native host for.
4. Click the wgproxyrs icon, import a `.conf`, pick the profile, **Connect**.
5. Disconnect from the popup when done. To remove everything, run
   `uninstall.ps1` and remove the extension in `edge://extensions`.

## Key hygiene

- `.conf` files contain a **private key**. Imported profiles are stored as
  plain files in the bundle's `profiles\` folder and **stay there until you
  delete them manually** (popup Delete button, or delete the file) — that is
  a deliberate, simple choice for this draft. Protect the bundle folder like
  any other key material.
- The private key is **never** stored in `chrome.storage`, never shown in
  the popup, and never included in any native-host response (the host test
  in CI asserts this).
- Disconnect never deletes a profile. Deleting the *active* profile is
  refused until you disconnect.

## What works in this draft vs what is stubbed

Works: multi-profile import/list/delete, config summary parsing (endpoint,
AllowedIPs, address, DNS), connect/disconnect, browser proxy set/clear,
status polling (`wgproxyrs status --info 127.0.0.1:1182`, exit 0 up /
1 down / 2 unreachable), persistent profiles, fail-closed behaviour inherited
from wgproxyrs (tunnel down ⇒ proxy refuses traffic instead of leaking it).

Stubbed / not yet: no auto-reconnect, no tray/icon state changes, no
Edge Add-ons packaging or signing, no in-extension binary updates, Linux
native-host install is not wired up (the PowerShell host also runs under
`pwsh` on Linux, which is how CI tests it, but the Windows/Edge path is the
supported one).

## Open questions

- Should profiles eventually be encrypted at rest, or is folder-level trust
  acceptable long-term?
- One active profile at a time is assumed. Is concurrent multi-tunnel ever
  wanted?
- When wgproxyrs ships a new version, should the bundle update the exe in
  place, or stay a fresh-download model?

## Development

- `node tests/config-parse.test.mjs` — popup parser test.
- `python3 tests/host_driver.py` — full native-host protocol test against a
  stub engine (needs `pwsh` or `powershell`).
- CI (`.github/workflows/ci.yml`): validation + host test on Ubuntu, then a
  Windows job that builds `wgproxyrs.exe` from `yukiproz/wgproxyrs`, smoke
  tests it, and uploads the self-contained bundle zip as an artifact.
  Binaries are CI artifacts, never committed to this repo.
