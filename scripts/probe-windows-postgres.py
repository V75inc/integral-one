"""Temporary native qualification of the exact managed PostgreSQL helper."""
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from local_permissions import private_directory

root = Path(os.environ['RUNNER_TEMP']) / ('one-pg-helper-' + uuid.uuid4().hex)
root.mkdir()
private_directory(root)
(root / 'installation.json').write_text(json.dumps({'database_password': secrets.token_hex(32)}))
with (root / 'helper.log').open('w') as log:
    process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('probe_local_postgres.py')), str(root)], stdout=log, stderr=log)
    try:
        for _ in range(60):
            if (root / 'database.json').exists():
                break
            if process.poll() is not None:
                raise RuntimeError('Helper exited before readiness: ' + (root / 'helper.log').read_text())
            time.sleep(1)
        assert (root / 'database.json').exists(), 'Database readiness timed out'
        print('Native protected-directory PostgreSQL helper reached readiness (credentials omitted)', flush=True)
        (root / 'database.stop.request').touch()
        process.wait(timeout=30)
        assert process.returncode == 0, 'Helper did not stop cleanly'
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=30)
shutil.rmtree(root)
