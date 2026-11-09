"use strict";
const $ = (id) => document.getElementById(id);

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: "no response" });
    });
  });
}

function say(text) { $("message").textContent = text || ""; }

function render(state) {
  const s = state.status || { state: "unreachable" };
  const box = $("status");
  box.className = "status " + (s.state === "up" ? "up" : s.state === "down" ? "down" : "unreachable");
  $("statusText").textContent =
    s.state === "unreachable" ? "engine unreachable in WSL" : `tunnel ${s.state}${state.connected ? " · browser connected" : ""}`;
  if (s.detail && typeof s.detail === "object") {
    const d = s.detail;
    const parts = [];
    if (d.handshake_age_secs !== undefined) parts.push(`handshake ${d.handshake_age_secs}s ago`);
    if (d.peers) parts.push(`${Array.isArray(d.peers) ? d.peers.length : d.peers} peer(s)`);
    $("detail").textContent = parts.join(" · ");
  } else {
    $("detail").textContent = s.detail || "";
  }
  const radio = document.querySelector(`input[name="mode"][value="${state.mode || "socks5"}"]`);
  if (radio) radio.checked = true;
}

async function refresh() {
  const state = await send({ type: "state" });
  if (state.ok) render(state);
  else say(state.error);
}

$("connectBtn").addEventListener("click", async () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  say("connecting…");
  const r = await send({ type: "connect", mode });
  say(r.ok ? `browser traffic now goes through the WSL tunnel (${mode})` : r.error);
  await refresh();
});

$("disconnectBtn").addEventListener("click", async () => {
  const r = await send({ type: "disconnect" });
  say(r.ok ? "disconnected (wgproxyrs in WSL keeps running)" : r.error);
  await refresh();
});

refresh();
setInterval(refresh, 3000);
