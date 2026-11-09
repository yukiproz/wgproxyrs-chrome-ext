"use strict";
// Manifest contract test for the WSL-localhost edition. Run: node tests/manifest.test.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";

const m = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
assert.equal(m.manifest_version, 3);
assert.equal(m.version, "0.2.1");
// The whole point of v0.2: NO native messaging. The engine is reached over
// WSL localhost instead.
assert.ok(!m.permissions.includes("nativeMessaging"), "nativeMessaging must be gone in v0.2");
assert.deepEqual(new Set(m.permissions), new Set(["proxy", "privacy", "storage"]));
// Status may live on the standing recipe port (1182) or the draft port (1082).
assert.deepEqual(new Set(m.host_permissions), new Set(["http://127.0.0.1:1182/*", "http://127.0.0.1:1082/*"]));
console.log("manifest.test: OK");
