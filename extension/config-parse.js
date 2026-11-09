"use strict";
// Minimal WireGuard .conf parser for DISPLAY only.
// Secret values (PrivateKey, PresharedKey) are never returned, only presence flags.
function parseConfigText(text) {
  const result = { address: [], dns: [], hasPrivateKey: false, peers: [] };
  let section = null;
  let peer = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      section = sec[1].trim().toLowerCase();
      if (section === "peer") {
        peer = { endpoint: null, allowedIPs: [], hasPresharedKey: false };
        result.peers.push(peer);
      }
      continue;
    }
    const kv = line.match(/^([^=]+)=(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    const value = kv[2].trim();
    if (section === "interface") {
      if (key === "address") result.address = value.split(",").map((s) => s.trim()).filter(Boolean);
      else if (key === "dns") result.dns = value.split(",").map((s) => s.trim()).filter(Boolean);
      else if (key === "privatekey") result.hasPrivateKey = value.length > 0;
    } else if (section === "peer" && peer) {
      if (key === "endpoint") peer.endpoint = value;
      else if (key === "allowedips") peer.allowedIPs = value.split(",").map((s) => s.trim()).filter(Boolean);
      else if (key === "presharedkey") peer.hasPresharedKey = value.length > 0;
    }
  }
  return result;
}
if (typeof globalThis !== "undefined") globalThis.parseConfigText = parseConfigText;
if (typeof module !== "undefined" && module.exports) module.exports = { parseConfigText };
