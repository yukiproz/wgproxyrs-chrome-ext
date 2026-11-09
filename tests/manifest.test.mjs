"use strict";
// Manifest contract test for the WSL-localhost edition. Run: node tests/manifest.test.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";

const m = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
assert.equal(m.manifest_version, 3);
assert.equal(m.version, "0.3.0");
// The whole point of v0.2: NO native messaging. The engine is reached over
// WSL localhost instead.
assert.ok(!m.permissions.includes("nativeMessaging"), "nativeMessaging must be gone in v0.2");
assert.deepEqual(new Set(m.permissions), new Set(["proxy", "privacy", "storage"]));
// Ports are user-configurable in the popup, so the host permission is the
// portless loopback pattern (any port on 127.0.0.1, nothing external).
assert.deepEqual(m.host_permissions, ["http://127.0.0.1/*"]);
console.log("manifest.test: OK");
