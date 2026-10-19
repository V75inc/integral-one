"""Temporary native first-start authentication and retained-record check."""
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit
import pgserver
from local_permissions import private_directory

root = Path(os.environ['RUNNER_TEMP']) / ('one-pg-auth-' + uuid.uuid4().hex)
root.mkdir()
private_directory(root)
config = json.dumps({'database_password': secrets.token_hex(32)})
(root / 'installation.json').write_text(config)
psql = Path(pgserver.__file__).parent / 'pginstall/bin/psql.exe'
try:
    for attempt in range(2):
        (root / 'database.json').unlink(missing_ok=True)
        (root / 'database.stop.request').unlink(missing_ok=True)
        with (root / 'helper.log').open('w') as log:
            proc = subprocess.Popen([sys.executable, str(Path(__file__).with_name('probe_local_postgres.py')), str(root)], stdout=log, stderr=log)
            try:
                for _ in range(60):
                    if (root / 'database.json').exists():
                        break
                    if proc.poll() is not None:
                        raise RuntimeError('Helper exited: ' + (root / 'helper.log').read_text())
                    time.sleep(1)
                if not (root / 'database.json').exists():
                    password = json.loads(config)['database_password']
                    for diagnostic in (root / 'helper.log', root / 'postgres/log'):
                        if diagnostic.exists():
                            print(diagnostic.name + ': ' + diagnostic.read_text(errors='replace')[-12000:].replace(password, '<redacted>'), flush=True)
                    raise RuntimeError('Readiness timeout')
                uri = urlsplit(json.loads((root / 'database.json').read_text())['dsn'])
                env = {**os.environ, 'PGHOST': uri.hostname, 'PGPORT': str(uri.port), 'PGUSER': 'postgres', 'PGDATABASE': 'postgres', 'PGPASSWORD': uri.password}
                sql = 'CREATE TABLE retained_record (value text); INSERT INTO retained_record VALUES (\'preserved\');' if attempt == 0 else 'SELECT value FROM retained_record;'
                result = subprocess.run([str(psql), '--no-password', '-t', '-A', '-c', sql], env=env, capture_output=True, text=True, check=True)
                if attempt:
                    assert result.stdout.strip() == 'preserved'
                assert (root / 'installation.json').read_text() == config
                assert not list(root.glob('.postgres-password-*'))
                (root / 'database.stop.request').touch()
                proc.wait(timeout=30)
                assert proc.returncode == 0
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    proc.wait(timeout=30)
    print('Native Windows first-start password guard, authenticated access, restart, key and record retention: passed (credentials omitted)')
finally:
    shutil.rmtree(root)
