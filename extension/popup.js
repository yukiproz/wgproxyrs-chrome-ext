"use strict";
const $ = (id) => document.getElementById(id);
let portsLoaded = false;

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: "no response" });
    });
  });
}

function say(text) { $("message").textContent = text || ""; }

function renderPorts(ports) {
  if (!ports) return;
  $("socksLabel").textContent = ports.socks5;
  $("httpLabel").textContent = ports.http;
  $("cmdText").textContent =
    `wgproxyrs --config uner.conf --bind 127.0.0.1:${ports.socks5} --http-bind 127.0.0.1:${ports.http} --info-bind 127.0.0.1:${ports.info}`;
  if (!portsLoaded) {
    $("socksPort").value = ports.socks5;
    $("httpPort").value = ports.http;
    $("infoPort").value = ports.info;
    portsLoaded = true;
  }
}

function render(state) {
  renderPorts(state.ports);
  const s = state.status || { state: "unreachable" };
  const box = $("status");
  box.className = "status " + (s.state === "up" ? "up" : s.state === "down" ? "down" : "unreachable");
  $("statusText").textContent =
    s.state === "unreachable" ? "engine unreachable in WSL" : `tunnel ${s.state}${state.connected ? " · browser connected" : ""}`;
  if (s.detail && typeof s.detail === "object") {
    const d = s.detail;
    const parts = [];
    if (d.endpoint) parts.push(d.endpoint);
    if (d.handshake_age_secs !== undefined && d.handshake_age_secs !== null) parts.push(`handshake ${d.handshake_age_secs}s ago`);
    const peers = d.per_peer || d.peers;
    if (peers) parts.push(`${Array.isArray(peers) ? peers.length : peers} peer(s)`);
    if (s.infoPort) parts.push(`info :${s.infoPort}`);
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

$("savePortsBtn").addEventListener("click", async () => {
  const ports = {
    socks5: Number($("socksPort").value),
    http: Number($("httpPort").value),
    info: Number($("infoPort").value),
  };
  const r = await send({ type: "savePorts", ports });
  if (r.ok) {
    portsLoaded = false;
    say(`ports saved: SOCKS ${ports.socks5} · HTTP ${ports.http} · status ${ports.info}`);
    await refresh();
  } else {
    say(r.error);
  }
});

refresh();
setInterval(refresh, 3000);
