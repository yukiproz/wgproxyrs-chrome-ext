#!/usr/bin/env python3
"""End-to-end smoke test for the PowerShell native host.

Speaks real Chrome Native Messaging framing to `wgproxyrs-host.ps1`
(one process per message, like sendNativeMessage) against a stub
wgproxyrs binary, and verifies: import -> list -> start -> status ->
stop -> delete, profile persistence, and that secret key material
never appears in any host response.

Env:
  PWSH          powershell executable (default: pwsh, fallback powershell)
  HOST_PS1      path to wgproxyrs-host.ps1 (default: repo native-host/)
"""
import json
import os
import stat
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HOST_PS1 = Path(os.environ.get("HOST_PS1", REPO / "native-host" / "wgproxyrs-host.ps1"))
PWSH = os.environ.get("PWSH") or ("pwsh" if subprocess.run(["which", "pwsh"], capture_output=True).returncode == 0 else "powershell")

SECRET = "SECRET_PRIVATE_KEY_VALUE_FOR_TEST"
CONF = f"""[Interface]
PrivateKey = {SECRET}
Address = 10.99.0.2/32
DNS = 10.99.0.1

[Peer]
PublicKey = abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG=
Endpoint = 127.0.0.1:51820
AllowedIPs = 10.99.0.0/24
"""

STUB = """#!/usr/bin/env python3
import sys, time
if len(sys.argv) > 1 and sys.argv[1] == "status":
    sys.exit(0)  # tunnel up
if "--version" in sys.argv:
    print("wgproxyrs 0.2.1-stub"); sys.exit(0)
time.sleep(60)  # daemon mode: stay alive until the host kills us
"""


def call(env, message):
    payload = json.dumps(message).encode()
    proc = subprocess.run(
        [PWSH, "-NoProfile", "-File", str(HOST_PS1)],
        input=struct.pack("<I", len(payload)) + payload,
        capture_output=True,
        env=env,
        timeout=60,
    )
    raw = proc.stdout
    assert len(raw) >= 4, f"host produced no framed reply (rc={proc.returncode}, stderr={proc.stderr.decode(errors='replace')[:500]})"
    (length,) = struct.unpack("<I", raw[:4])
    body = raw[4 : 4 + length]
    assert SECRET.encode() not in raw, "secret key material leaked into a host response"
    return json.loads(body)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "bundle"
        (home / "bin").mkdir(parents=True)
        stub = home / "bin" / "wgproxyrs"
        stub.write_text(STUB)
        stub.chmod(stub.stat().st_mode | stat.S_IEXEC)

        env = dict(os.environ)
        env["WGPROXYRS_EXT_HOME"] = str(home)
        env["WGPROXYRS_BIN"] = str(stub)

        r = call(env, {"cmd": "import", "name": "testprof", "configText": CONF})
        assert r["ok"], r
        assert r["profile"]["peers"][0]["endpoint"] == "127.0.0.1:51820", r
        conf_file = home / "profiles" / "testprof.conf"
        assert conf_file.exists(), "profile file was not persisted"

        r = call(env, {"cmd": "list"})
        assert r["ok"] and [p["name"] for p in r["profiles"]] == ["testprof"], r

        r = call(env, {"cmd": "start", "name": "testprof"})
        assert r["ok"] and r["pid"] > 0, r

        r = call(env, {"cmd": "status"})
        assert r["ok"] and r["state"] == "up" and r["activeProfile"] == "testprof", r

        r = call(env, {"cmd": "delete", "name": "testprof"})
        assert not r["ok"], "deleting the active profile must be refused"

        r = call(env, {"cmd": "stop"})
        assert r["ok"], r
        r = call(env, {"cmd": "status"})
        assert r["ok"] and r["state"] == "unreachable", r

        # Persistence: file survives disconnect; deletion is manual only.
        assert conf_file.exists(), "profile file must survive disconnect"
        r = call(env, {"cmd": "delete", "name": "testprof"})
        assert r["ok"] and not conf_file.exists(), r

        r = call(env, {"cmd": "import", "name": "../evil", "configText": CONF})
        assert not r["ok"], "path traversal profile name must be refused"

    print("host_driver: OK")


if __name__ == "__main__":
    main()
