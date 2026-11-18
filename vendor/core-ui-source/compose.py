#!/usr/bin/env python3
"""Immutable source composition for independently built Integral distributions."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

# Build-time inputs live inside each composed output, never in its parent. This
# keeps multiple distributions independent while retaining the SDK guide gate.
GUIDE_INPUTS = (
    "sdk/react/bin/app-ui-guides.mjs",
    "sdk/react/bin/app-ui-guides.test.mjs",
    "sdk/react/APP_UI_GUIDE.md",
    "sdk/react/package.json",
    "APP_UI_GUIDE.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".cursor/rules/app-ui.mdc",
)
GUIDE_CHECK = (
    "node ../sdk/react/bin/app-ui-guides.mjs --check --target .."
    " && node --test ../sdk/react/bin/app-ui-guides.test.mjs"
)
SUPPORT = ".core-build-support"
# These source imports are relative to the monorepo frontend. Preserve the flat
# distribution output contract while relocating the exact SDK into that output.
SDK_REFERENCES = {
    "tsconfig.json": ("../sdk/react/", f"./{SUPPORT}/sdk/react/"),
    "vite.config.ts": ("../sdk/react", f"./{SUPPORT}/sdk/react"),
    "vitest.config.ts": ("../sdk/react/", f"./{SUPPORT}/sdk/react/"),
    "scripts/verify-ui-runtime.mjs": ("../../sdk/react/", f"../{SUPPORT}/sdk/react/"),
    "src/components/extensions/sdkRuntime.ts": (
        "../../../../sdk/react/",
        f"../../../{SUPPORT}/sdk/react/",
    ),
}


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
    sdk_sources = subprocess.check_output(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "sdk/react/src",
        ],
        cwd=root,
        text=True,
    ).splitlines()
    for name in sorted(set(GUIDE_INPUTS) | set(sdk_sources)):
        source = root / name
        if not source.is_file() or source.is_symlink():
            raise ValueError(f"Unsupported build input: {name}")
        target = output / "build-support" / name
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
            if rel.parts[0] in {
                "registry.ts",
                "registry.tsx",
                "session-contract.ts",
            } or any(part.startswith(".env") for part in rel.parts):
                raise ValueError(
                    "Overlay cannot replace the host registry/session contract or include environment secrets"
                )
            extra[rel.as_posix()] = digest(p)
    package_path = core / "frontend/package.json"
    package = json.loads(package_path.read_text()) if package_path.exists() else {}
    guide_check = package.get("scripts", {}).get("check:app-ui-guides")
    if guide_check:
        if guide_check != GUIDE_CHECK:
            raise ValueError("Unsupported frontend App UI guide command")
        if any(f"build-support/{name}" not in inventory for name in GUIDE_INPUTS):
            raise ValueError("Core snapshot is missing App UI guide build inputs")
        if (core / "frontend" / SUPPORT).exists():
            raise ValueError("Frontend collides with reserved build-support directory")
    replacements = {}
    if guide_check:
        if "build-support/sdk/react/src/index.tsx" not in inventory:
            raise ValueError("Core snapshot is missing React SDK source")
        for name, (old, new) in SDK_REFERENCES.items():
            source = (core / "frontend" / name).read_text()
            if source.count(old) != 1:
                raise ValueError(f"Unsupported SDK reference in {name}")
            replacements[name] = source.replace(old, new)
        # SDK guide tests are node:test programs, run by the explicit build gate,
        # not frontend Vitest suites. Preserve every existing app exclusion.
        vitest = replacements["vitest.config.ts"]
        if vitest.count("exclude: [") != 1:
            raise ValueError("Unsupported Vitest exclusion configuration")
        replacements["vitest.config.ts"] = vitest.replace(
            "exclude: [", f"exclude: ['{SUPPORT}/**', "
        )
    shutil.copytree(core / "frontend", output)
    if guide_check:
        shutil.copytree(core / "build-support", output / SUPPORT)
        package["scripts"]["check:app-ui-guides"] = (
            f"node {SUPPORT}/sdk/react/bin/app-ui-guides.mjs --check --target {SUPPORT}"
            f" && node --test {SUPPORT}/sdk/react/bin/app-ui-guides.test.mjs"
        )
        write_json(output / "package.json", package)
        for name, content in replacements.items():
            (output / name).write_text(content)
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
