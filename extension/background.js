"use strict";
// Background service worker: owns the browser proxy setting and all
// Native Messaging calls to the wgproxyrs host (com.wgproxyrs.host).
// One-shot sendNativeMessage is used on purpose: the host process exits
// after each reply, while the wgproxyrs daemon it launches keeps running.

const HOST = "com.wgproxyrs.host";
const PROXY = { scheme: "socks5", host: "127.0.0.1", port: 1080 };

function native(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(HOST, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: "native host unreachable: " + chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false, error: "empty response from native host" });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

function setProxy() {
  return new Promise((resolve) => {
    chrome.proxy.settings.set(
      {
        scope: "regular",
        value: {
          mode: "fixed_servers",
          rules: {
            singleProxy: PROXY,
            bypassList: ["localhost", "127.0.0.1"],
          },
        },
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case "list":
        sendResponse(await native({ cmd: "list" }));
        break;
      case "import":
        sendResponse(await native({ cmd: "import", name: msg.name, configText: msg.configText }));
        break;
      case "delete":
        sendResponse(await native({ cmd: "delete", name: msg.name }));
        break;
      case "connect": {
        const started = await native({ cmd: "start", name: msg.name });
        if (!started.ok) {
          sendResponse(started);
          break;
        }
        // Set the proxy only after the daemon process exists. wgproxyrs is
        // fail-closed: while the tunnel is down its proxy refuses traffic
        // instead of leaking it outside the tunnel.
        await setProxy();
        const status = await native({ cmd: "status" });
        sendResponse({ ok: true, status });
        break;
      }
      case "disconnect": {
        // Clear the browser proxy FIRST so the browser never points at a
        // proxy that is about to disappear, then stop the daemon.
        await clearProxy();
        sendResponse(await native({ cmd: "stop" }));
        break;
      }
      case "status":
        sendResponse(await native({ cmd: "status" }));
        break;
      default:
        sendResponse({ ok: false, error: "unknown message type" });
    }
  })();
  return true; // keep the message channel open for the async reply
});

// If the browser starts with a stale proxy pointing at a dead daemon,
// traffic would fail (fail-closed), not leak. We still clear it when the
// host reports no daemon running, as a convenience.
chrome.runtime.onStartup.addListener(async () => {
  const status = await native({ cmd: "status" });
  if (!status.ok || status.state === "unreachable") await clearProxy();
});
