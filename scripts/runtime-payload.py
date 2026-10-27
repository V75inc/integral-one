#!/usr/bin/env python3
"""Package a qualified Core + One UI update without building an Electron app."""
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def package(root, output, platforms, one_source=None):
    pins = json.loads((root / "distribution.json").read_text())
    product = json.loads((root / "package.json").read_text())
    core = pins["core"]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?", core["version"]):
        raise ValueError("Invalid Core runtime version")
    if output.exists():
        raise ValueError("Choose a fresh runtime release directory")
    if not platforms or any(value not in {"darwin-arm64", "win32-x64", "linux-x64"} for value in platforms):
        raise ValueError("Publish only explicitly qualified platforms")
    base = root / core["base_wheel"]
    wheel = root / "resources/core" / core["wheel_filename"]
    runtime = json.loads((root / "resources/core/runtime.json").read_text())
    if digest(base) != core["wheel_sha256"] or runtime["sha256"][runtime["coreWheel"]] != digest(wheel):
        raise ValueError("Reviewed base/composed runtime pins changed")
    manifest = {
        "schemaVersion": 1,
        "product": "integral-one-runtime",
        "channel": product["integralOneUpdates"]["channel"],
        "core": {"version": core["version"], "registry": "testpypi" if product["integralOneUpdates"]["channel"] == "development" else "pypi", "wheelSha256": core["wheel_sha256"]},
        "minimumOneVersion": "0.1.9",
        "maximumOneVersionExclusive": "0.2.0",
        "hostContractVersion": 1,
        "platforms": sorted(set(platforms)),
        "wheel": {"file": wheel.name, "sha256": digest(wheel)},
        "source": {"one": one_source or subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(), "core": core["source_commit"]},
    }
    if not re.fullmatch(r"[a-f0-9]{40}", manifest["source"]["one"]):
        raise ValueError("Require an exact One source commit")
    spec = importlib.util.spec_from_file_location("runtime_validator", root / "desktop/runtime-updates/payload.py")
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    validator.verify_wheel(wheel, base, manifest)
    notices = root / "resources/notices"
    if not (notices / "THIRD-PARTY-NOTICES.txt").is_file() or not (notices / "inventory.json").is_file():
        raise ValueError("Build dependency notices before packaging a runtime")
    files = {wheel.name: wheel}
    for file in notices.rglob("*"):
        if file.is_symlink():
            raise ValueError("Runtime notices cannot contain symbolic links")
        if file.is_file():
            files["notices/" + file.relative_to(notices).as_posix()] = file
    output.mkdir(parents=True)
    payload = output / f"integral-one-runtime-{core['version']}.zip"
    with zipfile.ZipFile(payload, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, file in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, file.read_bytes())
    manifest["payload"] = {"file": payload.name, "sha256": digest(payload), "bytes": payload.stat().st_size}
    if manifest["payload"]["bytes"] > 128 * 1024 * 1024:
        raise ValueError("Runtime payload is too large")
    (output / "runtime-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"result": "pass", "core": core["version"], "payload": manifest["payload"], "electronBuilt": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--platform", action="append", required=True)
    parser.add_argument("--one-source", help="Exact One source commit for a task-owned source snapshot")
    args = parser.parse_args()
    package(args.root.resolve(), args.output.resolve(), args.platform, args.one_source)
