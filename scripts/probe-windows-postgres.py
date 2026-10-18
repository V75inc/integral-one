"""Temporary native investigation of pgserver initdb path/locale behavior."""
import json
import csv
import io
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import pgserver
from probe_private_permissions import private_directory

if os.name != "nt":
    raise SystemExit("This probe requires a native Windows runner")
exe = Path(pgserver.__file__).parent / "pginstall/bin/initdb.exe"
cases = [
    ("private-directory", "private", False, []),
    ("default-directory", "default", False, []),
    ("missing-directory", "missing", False, []),
    ("no-locale", "missing", False, ["--no-locale"]),
    ("C-locale", "missing", False, ["--locale=C"]),
    ("relative-directory", "missing", True, []),
]
cases = [("explicit-user-private-root", "explicit", False, [])]
for name, creation, relative, extra in cases:
    root = Path(os.environ["RUNNER_TEMP"]) / ("one-pg-inherited-" + uuid.uuid4().hex)
    root.mkdir()
    private_directory(root)
    try:
        print(subprocess.run(["icacls", str(root)], capture_output=True, text=True).stdout, flush=True)
        data = root / "postgres"
        if creation == "explicit":
            data.mkdir()
            private_directory(data)
        elif creation == "private":
            data.mkdir(mode=0o700)
            data.chmod(0o700)
        elif creation == "default":
            data.mkdir()
        args = [str(exe), "-D", "postgres" if relative else str(data),
                "--auth=trust", "--auth-local=trust", "--encoding=utf8", "-U", "postgres", *extra]
        result = subprocess.run(args, cwd=root, capture_output=True, timeout=40)
        print(json.dumps({"case": name, "returncode": result.returncode,
                          "stdout": result.stdout.decode("utf-8", errors="replace")[-1800:],
                          "stderr": result.stderr.decode("utf-8", errors="replace")[-1800:]}), flush=True)
        assert result.returncode == 0, "Private owner SID initialization failed"
    finally:
        shutil.rmtree(root)
