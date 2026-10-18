#!/usr/bin/env python3
"""Compose a licensed Core wheel with the verified distribution UI; no engine fork."""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
import os
import tempfile
import zipfile
from pathlib import Path


def compose(base: Path, ui: Path, output: Path, expected_sha: str) -> dict:
    if hashlib.sha256(base.read_bytes()).hexdigest() != expected_sha:
        raise ValueError("Core base wheel differs from reviewed pin")
    if not (ui / "index.html").is_file():
        raise ValueError("Build the One UI before composing a runtime")
    files = {}
    with zipfile.ZipFile(base) as source:
        for name in source.namelist():
            if name.endswith("/"):
                continue
            if name.startswith("/") or ".." in Path(name).parts or "\\" in name:
                raise ValueError("Unsafe base wheel path")
            if name.endswith(("/RECORD.jws", "/RECORD.p7s")):
                raise ValueError(
                    "Signed upstream wheels require an explicit re-signing workflow"
                )
            if name in files:
                raise ValueError("Duplicate base wheel member")
            files[name] = source.read(name)
    record = next(name for name in files if name.endswith(".dist-info/RECORD"))
    metadata = next(name for name in files if name.endswith(".dist-info/METADATA"))
    if b"License-Expression: Apache-2.0" not in files[metadata]:
        raise ValueError("Core Apache metadata must be preserved")
    files = {
        name: value
        for name, value in files.items()
        if not name.startswith("app/web/static/") and name != record
    }
    for path in sorted(ui.rglob("*")):
        if path.is_symlink():
            raise ValueError("UI assets must not be symlinks")
        if path.is_file():
            files["app/web/static/" + path.relative_to(ui).as_posix()] = (
                path.read_bytes()
            )
    manifest = {
        "contract_version": 1,
        "product": "integral-one",
        "base_wheel_sha256": expected_sha,
        "composition": "Only app/web/static is replaced; Core engine and original licenses unchanged",
        "modified_notice": "Integral One distribution UI composed by V75 Inc.; Apache-2.0",
        "ui_sha256": {
            name.removeprefix("app/web/static/"): hashlib.sha256(value).hexdigest()
            for name, value in files.items()
            if name.startswith("app/web/static/")
        },
    }
    files["app/web/distribution.json"] = (
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    ).encode()
    rows = []
    for name, value in sorted(files.items()):
        sha = (
            base64.urlsafe_b64encode(hashlib.sha256(value).digest())
            .rstrip(b"=")
            .decode()
        )
        rows.append([name, "sha256=" + sha, str(len(value))])
    rows.append([record, "", ""])
    stream = io.StringIO(newline="")
    csv.writer(stream, lineterminator="\n").writerows(rows)
    files[record] = stream.getvalue().encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=output.parent, suffix=".whl.tmp")
    os.close(handle)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as wheel:
            for name, value in sorted(files.items()):
                entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o644 << 16
                wheel.writestr(entry, value)
        os.replace(temporary, output)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--ui", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()
    compose(args.base, args.ui, args.output, args.sha256)
    print(
        "Composed One UI into Core wheel; preserved engine/licenses and rebuilt wheel RECORD."
    )
