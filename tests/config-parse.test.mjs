"use strict";
// Plain-assert test for the popup config parser. Run: node tests/config-parse.test.mjs
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseConfigText } = require("../extension/config-parse.js");

const conf = `
[Interface]
PrivateKey = SECRET_PRIVATE_KEY_VALUE
Address = 10.99.0.2/32
DNS = 10.99.0.1

[Peer]
PublicKey = abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG=
PresharedKey = SECRET_PRESHARED_KEY_VALUE
Endpoint = eduvpn.example.ac.id:51820
AllowedIPs = 0.0.0.0/0, ::/0
`;

const parsed = parseConfigText(conf);
assert.deepEqual(parsed.address, ["10.99.0.2/32"]);
assert.deepEqual(parsed.dns, ["10.99.0.1"]);
assert.equal(parsed.hasPrivateKey, true);
assert.equal(parsed.peers.length, 1);
assert.equal(parsed.peers[0].endpoint, "eduvpn.example.ac.id:51820");
assert.deepEqual(parsed.peers[0].allowedIPs, ["0.0.0.0/0", "::/0"]);
const serialized = JSON.stringify(parsed);
assert.ok(!serialized.includes("SECRET_PRIVATE_KEY_VALUE"), "private key leaked into parse output");
assert.ok(!serialized.includes("SECRET_PRESHARED_KEY_VALUE"), "preshared key leaked into parse output");
console.log("config-parse.test: OK");
