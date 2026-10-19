#!/usr/bin/env python3
"""Immutable source composition for independently built Integral distributions."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def safe_files(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Source composition does not accept symlinks")
        if path.is_file():
            yield path


def snapshot(output: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    if output.exists():
        raise ValueError("Output exists; choose a fresh snapshot directory")
    files = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "frontend"],
        cwd=root,
        text=True,
    ).splitlines()
    output.mkdir(parents=True)
    for name in sorted(set(files)):
        source = root / name
        rel = source.relative_to(root / "frontend")
        if any(
            part in {"node_modules", "dist", ".env"} or part.startswith(".env.")
            for part in rel.parts
        ):
            continue
        if not source.is_file() or source.is_symlink():
            raise ValueError(f"Unsupported source file: {name}")
        target = output / "frontend" / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for name in ("LICENSE", "NOTICE"):
        source = root / "backend" / name
        shutil.copy2(source, output / name)
    shutil.copy2(__file__, output / "compose.py")
    inventory = {
        p.relative_to(output).as_posix(): digest(p) for p in safe_files(output)
    }
    tree = hashlib.sha256(json.dumps(inventory, sort_keys=True).encode()).hexdigest()
    write_json(
        output / "core-source.json",
        {
            "contract_version": 1,
            "source_commit": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=root, text=True
            ).strip(),
            "source_tree_sha256": tree,
            "files": inventory,
            "license_state": "Apache-2.0 Core and One; inherited component grants retained",
        },
    )
    print(f"Core UI snapshot {tree}: {len(inventory)} files")


def compose(core: Path, output: Path, overlay: Path | None, product: str) -> None:
    descriptor = json.loads((core / "core-source.json").read_text())
    if descriptor.get("contract_version") != 1:
        raise ValueError("Unsupported Core source contract")
    inventory = descriptor["files"]
    expected_tree = hashlib.sha256(
        json.dumps(inventory, sort_keys=True).encode()
    ).hexdigest()
    if descriptor["source_tree_sha256"] != expected_tree:
        raise ValueError("Core source identity does not match inventory")
    for name, expected in inventory.items():
        p = core / name
        if (
            Path(name).is_absolute()
            or ".." in Path(name).parts
            or p.is_symlink()
            or digest(p) != expected
        ):
            raise ValueError(f"Core source integrity mismatch: {name}")
    actual = {p.relative_to(core).as_posix() for p in safe_files(core)} - {
        "core-source.json"
    }
    if actual != set(inventory):
        raise ValueError("Core snapshot contains unrecorded files")
    if output.exists():
        raise ValueError("Output exists; choose a fresh build directory")
    # Product overlay can fill host slots but cannot replace Core's registry contract.
    extra = {}
    if overlay:
        for p in safe_files(overlay):
            rel = p.relative_to(overlay)
            if rel.parts[0] in {"registry.ts", "registry.tsx", "session-contract.ts"} or any(
                part.startswith(".env") for part in rel.parts
            ):
                raise ValueError(
                    "Overlay cannot replace the host registry/session contract or include environment secrets"
                )
            extra[rel.as_posix()] = digest(p)
    shutil.copytree(core / "frontend", output)
    if overlay:
        shutil.copytree(overlay, output / "src/host", dirs_exist_ok=True)
    write_json(
        output / "distribution-build.json",
        {
            "contract_version": 1,
            "product": product,
            "core_source_tree_sha256": expected_tree,
            "core_source_commit": descriptor["source_commit"],
            "frontend_lock_sha256": digest(output / "package-lock.json"),
            "overlay_sha256": extra,
            "boundary": "Host source is trusted build-time input; this is not a dynamic plugin sandbox",
        },
    )
    print(f"Composed {product}: {output}; run npm ci and npm run build there")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    snap = commands.add_parser("snapshot")
    snap.add_argument("--output", type=Path, required=True)
    build = commands.add_parser("compose")
    build.add_argument("--core", type=Path, required=True)
    build.add_argument("--output", type=Path, required=True)
    build.add_argument("--overlay", type=Path)
    build.add_argument("--product", required=True)
    args = parser.parse_args()
    if args.command == "snapshot":
        snapshot(args.output.resolve())
    else:
        compose(
            args.core.resolve(),
            args.output.resolve(),
            args.overlay.resolve() if args.overlay else None,
            args.product,
        )


if __name__ == "__main__":
    main()
