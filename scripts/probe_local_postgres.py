"""Private PostgreSQL helper; executable with the managed Python 3.12 environment.

This module deliberately imports no Core services and uses only pgserver's
published process API. The server retains its database when the helper exits.
"""

import json
import os
import re
import shlex
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

from local_permissions import private_directory


def main() -> None:
    """Run a private database until terminated, or create a logical dump."""
    import pgserver

    if os.name != "nt":
        from pgserver import postgres_server

        original_socket_dir = postgres_server.find_suitable_socket_dir

        def quoted_socket_dir(pgdata, runtime_path):
            # pgserver 0.1.4 leaves -k unquoted inside pg_ctl's -o string.
            # Adapt only this isolated helper, so normal macOS paths containing
            # spaces work. The parent prohibits its root-only Path.chmod branch.
            directory = original_socket_dir(pgdata, runtime_path)
            directory.chmod(0o700)
            return shlex.quote(str(directory))

        postgres_server.find_suitable_socket_dir = quoted_socket_dir

    binaries = Path(pgserver.__file__).parent / "pginstall" / "bin"
    root = Path(sys.argv[1]).resolve()
    config = json.loads((root / "installation.json").read_text())
    password = config["database_password"]
    if not re.fullmatch(r"[0-9a-f]{64}", password):
        raise ValueError("Invalid managed database credential format")
    data = root / "postgres"
    data.mkdir(exist_ok=True)
    private_directory(data)
    server = pgserver.get_server(data, cleanup_mode="stop")

    def terminate(_signum, _frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, terminate)
    signal.signal(signal.SIGINT, terminate)
    try:
        uri = server.get_uri()
        parsed = urlsplit(uri)
        # No shell interpolation: both paths and SQL travel as process data.
        env = {**os.environ, "PGPASSWORD": password}
        command = [
            str(binaries / "psql"),
            uri,
            "-v",
            "ON_ERROR_STOP=1",
        ]
        subprocess.run(
            command,
            input=f"ALTER USER postgres PASSWORD '{password}';\nSELECT pg_reload_conf();\n",
            text=True,
            env=env,
            stdout=subprocess.DEVNULL,
            check=True,
        )
        # Unix sockets are inside a private directory. Windows uses loopback
        # TCP, where every connection must authenticate even from this host.
        hba = root / "postgres" / "pg_hba.conf"
        hba.write_text(
            "local all all trust\n"
            "host all all 127.0.0.1/32 scram-sha-256\n"
            "host all all ::1/128 scram-sha-256\n"
        )
        subprocess.run(
            command,
            input="SELECT pg_reload_conf();\n",
            text=True,
            env=env,
            stdout=subprocess.DEVNULL,
            check=True,
        )
        if parsed.query and os.name != "nt":
            from urllib.parse import parse_qs

            socket_dir = Path(parse_qs(parsed.query)["host"][0])
            socket_dir.chmod(0o700)
        dsn = urlunsplit(
            (
                parsed.scheme,
                f"postgres:{quote(password)}@{parsed.netloc.split('@')[-1]}",
                parsed.path,
                parsed.query,
                "",
            )
        )
        ready = root / "database.json"
        temporary = root / "database.tmp"
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as handle:
            json.dump({"dsn": dsn}, handle)
        os.replace(temporary, ready)
        if len(sys.argv) > 2:
            subprocess.run(
                [
                    str(binaries / "pg_dump"),
                    uri,
                    "-Fc",
                    "-f",
                    sys.argv[2],
                ],
                env=env,
                check=True,
            )
            return
        while True:
            if (root / "database.stop.request").exists():
                break
            time.sleep(1)
    finally:
        server.cleanup()
        (root / "database.json").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
