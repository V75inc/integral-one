"""Validate and extract a bounded One runtime payload using managed Python only."""
import base64
import csv
import hashlib
import io
import json
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath


def members(archive, limit=512 * 1024 * 1024):
    entries = archive.infolist()
    if len(entries) > 20000 or sum(item.file_size for item in entries) > limit:
        raise ValueError("Runtime archive exceeds its expansion limit")
    names = set()
    folded = set()
    for item in entries:
        name = item.filename
        parts = PurePosixPath(name).parts
        mode = item.external_attr >> 16
        if (not name or name.startswith("/") or "\\" in name or PurePosixPath(name).as_posix() != name.rstrip("/") or
                any(part in {"..", "."} or ":" in part for part in parts) or
                name in names or name.casefold() in folded or
                stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in {0, stat.S_IFREG, stat.S_IFDIR})):
            raise ValueError("Unsafe or duplicate runtime archive member")
        names.add(name)
        folded.add(name.casefold())
    return {item.filename: item for item in entries if not item.is_dir()}


def verify_wheel(wheel, upstream, manifest):
    with zipfile.ZipFile(wheel) as built, zipfile.ZipFile(upstream) as base:
        actual = members(built)
        original = members(base)
        records = [name for name in actual if name.endswith(".dist-info/RECORD")]
        metadata = [name for name in actual if name.endswith(".dist-info/METADATA")]
        if len(records) != 1 or len(metadata) != 1:
            raise ValueError("Runtime wheel needs one package metadata record")
        text = built.read(metadata[0]).decode()
        if ("\nName: integral-core\n" not in text or
                f"\nVersion: {manifest['core']['version']}\n" not in text or
                "\nLicense-Expression: Apache-2.0\n" not in text):
            raise ValueError("Runtime metadata differs from the approved Core release")
        def engine(name):
            return not (name.startswith("app/web/static/") or name == "app/web/distribution.json" or name in records)
        if {name for name in actual if engine(name)} != {name for name in original if engine(name)}:
            raise ValueError("Runtime changed the Core package inventory")
        for name in actual:
            if engine(name) and built.read(name) != base.read(name):
                raise ValueError("Runtime changed the published Core engine or licenses")
        descriptor = json.loads(built.read("app/web/distribution.json"))
        if (descriptor.get("contract_version") != 1 or descriptor.get("product") != "integral-one" or
                descriptor.get("base_wheel_sha256") != manifest["core"]["wheelSha256"]):
            raise ValueError("Runtime UI came from a different product or Core wheel")
        inventory = descriptor.get("ui_sha256", {})
        if not inventory or set(inventory) != {name.removeprefix("app/web/static/") for name in actual if name.startswith("app/web/static/")}:
            raise ValueError("Runtime UI inventory is incomplete")
        for name, expected in inventory.items():
            if hashlib.sha256(built.read("app/web/static/" + name)).hexdigest() != expected:
                raise ValueError("Runtime UI integrity check failed")
        if "app/web/static/index.html" not in actual:
            raise ValueError("Runtime UI is missing")
        seen = set()
        for name, digest, size in csv.reader(io.StringIO(built.read(records[0]).decode())):
            if name in seen or name not in actual:
                raise ValueError("Invalid wheel RECORD inventory")
            seen.add(name)
            if name == records[0]:
                if digest or size:
                    raise ValueError("Invalid self RECORD")
                continue
            data = built.read(name)
            expected = "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
            if digest != expected or size != str(len(data)):
                raise ValueError("Wheel RECORD checksum failed")
        if seen != set(actual):
            raise ValueError("Wheel RECORD is incomplete")


def extract(payload, upstream, manifest_file, target):
    manifest = json.loads(manifest_file.read_text())
    if hashlib.sha256(payload.read_bytes()).hexdigest() != manifest["payload"]["sha256"] or payload.stat().st_size != manifest["payload"]["bytes"]:
        raise ValueError("Payload changed before extraction")
    if hashlib.sha256(upstream.read_bytes()).hexdigest() != manifest["core"]["wheelSha256"]:
        raise ValueError("Published base Core wheel changed")
    if target.exists() or target.is_symlink():
        raise ValueError("Runtime extraction requires a fresh directory")
    target.mkdir(mode=0o700)
    with zipfile.ZipFile(payload) as archive:
        files = members(archive, 256 * 1024 * 1024)
        expected_wheel = manifest["wheel"]["file"]
        if expected_wheel not in files or not any(name.startswith("notices/") for name in files):
            raise ValueError("Runtime payload is missing its wheel or notices")
        for name in files:
            if name != expected_wheel and not name.startswith("notices/"):
                raise ValueError("Unexpected runtime payload file")
            destination = target / name
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with destination.open("xb") as stream:
                stream.write(archive.read(name))
            destination.chmod(0o600)
    wheel = target / manifest["wheel"]["file"]
    if hashlib.sha256(wheel.read_bytes()).hexdigest() != manifest["wheel"]["sha256"]:
        raise ValueError("Composed wheel checksum failed")
    verify_wheel(wheel, upstream, manifest)
    (target / "runtime-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (target / "runtime-manifest.json").chmod(0o600)
    print(json.dumps({"result": "pass", "core": manifest["core"]["version"], "engineMatchesPublishedWheel": True, "oneUiAndNoticesVerified": True}))


if __name__ == "__main__":
    try:
        if len(sys.argv) != 5:
            raise ValueError("Expected payload, upstream wheel, manifest and fresh target")
        extract(*(Path(value) for value in sys.argv[1:]))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
