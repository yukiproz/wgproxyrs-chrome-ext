"use strict";
const $ = (id) => document.getElementById(id);
let pendingImport = null; // { name, text } held in popup memory only until imported

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: "no response" });
    });
  });
}

function say(text) { $("message").textContent = text || ""; }

async function refreshStatus() {
  const s = await send({ type: "status" });
  const box = $("status");
  box.className = "status " + (s.state || "unreachable");
  $("statusText").textContent = s.ok
    ? `tunnel ${s.state}${s.activeProfile ? " · " + s.activeProfile : ""}`
    : s.error || "host unreachable";
  $("activeBox").hidden = !(s.ok && s.activeProfile);
  if (s.activeProfile) $("activeName").textContent = s.activeProfile;
  return s;
}

async function refreshProfiles() {
  const res = await send({ type: "list" });
  const list = $("profileList");
  list.textContent = "";
  if (!res.ok) { say(res.error); $("emptyHint").hidden = true; return; }
  $("emptyHint").hidden = res.profiles.length > 0;
  for (const p of res.profiles) {
    const li = document.createElement("li");
    li.className = "profile";
    const meta = p.peers.map((x) => `${x.endpoint || "?"} → ${x.allowedIPs.join(", ")}`).join(" · ");
    li.innerHTML = "";
    const name = document.createElement("div"); name.className = "name"; name.textContent = p.name;
    const m = document.createElement("div"); m.className = "meta"; m.textContent = meta || "no peers";
    const row = document.createElement("div"); row.className = "row";
    const connect = document.createElement("button"); connect.textContent = "Connect";
    connect.addEventListener("click", async () => {
      say("starting…");
      const r = await send({ type: "connect", name: p.name });
      say(r.ok ? "connected (proxy set; tunnel state shown above)" : r.error);
      await refreshStatus();
    });
    const del = document.createElement("button"); del.textContent = "Delete"; del.className = "danger";
    del.addEventListener("click", async () => {
      const r = await send({ type: "delete", name: p.name });
      say(r.ok ? `deleted ${p.name}` : r.error);
      await refreshProfiles(); await refreshStatus();
    });
    row.append(connect, del);
    li.append(name, m, row);
    list.appendChild(li);
  }
}

$("fileInput").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseConfigText(text);
  pendingImport = { text };
  $("nameInput").value = file.name.replace(/\.conf$/i, "");
  const peerLines = parsed.peers.map((p) => `peer ${p.endpoint || "?"} → ${p.allowedIPs.join(", ")}`).join("\n");
  $("previewText").textContent =
    `address: ${parsed.address.join(", ") || "-"}\ndns: ${parsed.dns.join(", ") || "-"}\n` +
    `private key: ${parsed.hasPrivateKey ? "present (never shown)" : "MISSING"}\n${peerLines}`;
  $("preview").hidden = false;
});

$("importBtn").addEventListener("click", async () => {
  if (!pendingImport) return;
  const name = $("nameInput").value.trim();
  if (!name) { say("profile name required"); return; }
  const r = await send({ type: "import", name, configText: pendingImport.text });
  pendingImport = null;
  $("preview").hidden = true;
  $("fileInput").value = "";
  say(r.ok ? `imported ${name} — file kept in the bundle's profiles folder` : r.error);
  await refreshProfiles();
});

$("disconnectBtn").addEventListener("click", async () => {
  const r = await send({ type: "disconnect" });
  say(r.ok ? "disconnected (profile file kept)" : r.error);
  await refreshStatus();
});

refreshProfiles();
refreshStatus();
setInterval(refreshStatus, 3000);
