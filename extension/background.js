"use strict";
// Background service worker (v0.2 - WSL localhost edition).
//
// wgproxyrs runs in WSL on the same machine. WSL2 exposes services bound to
// localhost inside WSL as localhost on Windows, so this Edge instance can
// reach the engine directly - no native messaging host, no Windows binary:
//
//   SOCKS5 proxy  127.0.0.1:1080
//   HTTP proxy    127.0.0.1:1081
//   Status (JSON) 127.0.0.1:1082  (canonical; legacy 1182 also probed)
//
// The extension only does three things: set/clear the browser proxy,
// set/clear the WebRTC leak policy, and poll the status endpoint.
// Starting/stopping wgproxyrs itself happens in WSL, by the user.

// All three ports are user-configurable in the popup and persisted in
// chrome.storage.local. Defaults are the tidy sequence.
const DEFAULT_PORTS = { socks5: 1080, http: 1081, info: 1082 };

function validPort(n) { return Number.isInteger(n) && n >= 1 && n <= 65535; }

async function getPorts() {
  const stored = await chrome.storage.local.get(['wgPorts']);
  const ports = { ...DEFAULT_PORTS, ...(stored.wgPorts || {}) };
  for (const k of Object.keys(DEFAULT_PORTS)) if (!validPort(ports[k])) ports[k] = DEFAULT_PORTS[k];
  return ports;
}

// The status port is probed, not assumed: the configured port first,
// then legacy fallbacks (1182 came from Yuki's earlier example commands;
// instances started from those are still around).
function infoCandidates(ports) {
  return [...new Set([ports.info, 1182, 1082])];
}

async function fetchStatus() {
  const ports = await getPorts();
  for (const port of infoCandidates(ports)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) continue;
      const body = await res.json().catch(() => ({}));
      const state = body.status || body.state || "unknown";
      return { ok: true, state, detail: body, infoPort: port };
    } catch (_e) {
      // try the next candidate port
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: true, state: "unreachable", detail: `wgproxyrs not reachable (info ports tried: ${infoCandidates(ports).join(", ")})` };
}

function setProxy(mode, ports) {
  const proxy = mode === "http"
    ? { scheme: "http", host: "127.0.0.1", port: ports.http }
    : { scheme: "socks5", host: "127.0.0.1", port: ports.socks5 };
  return new Promise((resolve) => {
    chrome.proxy.settings.set(
      {
        scope: "regular",
        value: { mode: "fixed_servers", rules: { singleProxy: proxy, bypassList: ["localhost", "127.0.0.1"] } },
      },
      () => resolve(!chrome.runtime.lastError)
    );
  });
}

function clearProxy() {
  return new Promise((resolve) => {
    chrome.proxy.settings.clear({ scope: "regular" }, () => resolve(true));
  });
}

// WebRTC can bypass a SOCKS proxy over UDP and leak the real IP. While
// connected, force it onto proxied paths only; restore on disconnect.
function setWebRtcPolicy(value) {
  return new Promise((resolve) => {
    if (!chrome.privacy || !chrome.privacy.network.webRTCIPHandlingPolicy) return resolve(false);
    chrome.privacy.network.webRTCIPHandlingPolicy.set({ value, scope: "regular" }, () =>
      resolve(!chrome.runtime.lastError)
    );
  });
}

async function getState() {
  const stored = await chrome.storage.local.get(["wgConnected", "wgMode"]);
  const status = await fetchStatus();
  return { ok: true, connected: !!stored.wgConnected, mode: stored.wgMode || "socks5", ports: await getPorts(), status };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case "connect": {
        const mode = msg.mode === "http" ? "http" : "socks5";
        const status = await fetchStatus();
        if (status.state === "unreachable") {
          sendResponse({ ok: false, error: "wgproxyrs is not reachable in WSL on the configured info port. Start it in WSL first, or fix the ports below.", status });
          break;
        }
        await setProxy(mode, await getPorts());
        await setWebRtcPolicy("disable_non_proxied_udp");
        await chrome.storage.local.set({ wgConnected: true, wgMode: mode });
        sendResponse({ ok: true, status: await fetchStatus() });
        break;
      }
      case "disconnect": {
        await clearProxy();
        await setWebRtcPolicy("default");
        await chrome.storage.local.set({ wgConnected: false });
        sendResponse({ ok: true, status: await fetchStatus() });
        break;
      }
      case "savePorts": {
        const incoming = msg.ports || {};
        const ports = {};
        for (const k of ["socks5", "http", "info"]) {
          const n = Number(incoming[k]);
          if (!validPort(n)) { sendResponse({ ok: false, error: `invalid port for ${k}: ${incoming[k]}` }); return; }
          ports[k] = n;
        }
        await chrome.storage.local.set({ wgPorts: ports });
        sendResponse(await getState());
        break;
      }
      case "state":
        sendResponse(await getState());
        break;
      default:
        sendResponse({ ok: false, error: "unknown message type" });
    }
  })();
  return true;
});

// On browser startup, if our proxy flag is set but WSL wgproxyrs is gone,
// clear the stale proxy so the browser is not stranded on a dead proxy
// (wgproxyrs is fail-closed, so this is convenience, not leak protection).
chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get(["wgConnected"]);
  if (!stored.wgConnected) return;
  const status = await fetchStatus();
  if (status.state === "unreachable") {
    await clearProxy();
    await setWebRtcPolicy("default");
    await chrome.storage.local.set({ wgConnected: false });
  }
});
