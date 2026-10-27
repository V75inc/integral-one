#!/usr/bin/env python3
"""Prepare an immutable One update from an actual published Core wheel and tag.

No installed runtime, signing credential, account or user store is touched.
Read-only preparation/qualification precedes a separate runtime publisher (or
the legacy source-PR route). Native signing is never part of this script.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/V75inc/integral-core.git"
REGISTRIES = {"pypi": "https://pypi.org", "testpypi": "https://test.pypi.org"}
VERSION = re.compile(r"(\d+)\.(\d+)\.(\d+)(?:(a|b|rc)(\d+))?\Z")


def version_key(value):
    match = VERSION.fullmatch(value)
    if not match:
        raise ValueError("Unsupported Core release version")
    major, minor, patch, kind, number = match.groups()
    return (
        int(major),
        int(minor),
        int(patch),
        {"a": 0, "b": 1, "rc": 2, None: 3}[kind],
        int(number or 0),
    )


def select_release(releases, current, policy, requested=None):
    if (
        policy.get("schemaVersion") != 1
        or policy.get("registry") not in REGISTRIES
        or (policy.get("delivery"), policy.get("automaticPublication")) not in {
            ("qualified-one-release", False), ("qualified-runtime", True)
        }
    ):
        raise ValueError("Unsupported Core update policy")
    if not re.fullmatch(r"\d+\.\d+", policy.get("series", "")) or not isinstance(
        policy.get("allowPrereleases"), bool
    ):
        raise ValueError("Explicit Core series and prerelease policy are required")
    current_key = version_key(current)
    candidates = []
    for version, files in releases.items():
        if not VERSION.fullmatch(version):
            continue
        key = version_key(version)
        if ".".join(version.split(".")[:2]) != policy["series"] or (
            key[3] < 3 and not policy["allowPrereleases"]
        ):
            continue
        expected = f"integral_core-{version}-py3-none-any.whl"
        eligible = [
            f
            for f in files
            if f.get("filename") == expected
            and f.get("packagetype") == "bdist_wheel"
            and not f.get("yanked")
        ]
        if len(eligible) == 1 and key > current_key:
            candidates.append((key, version))
    if requested:
        version_key(requested)
        if requested not in [v for _, v in candidates]:
            raise ValueError(
                "Requested Core version is not a newer eligible publication"
            )
        return requested
    return max(candidates)[1] if candidates else None


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        raise ValueError("Release downloads must not redirect")


def download(url, limit):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Integral-One-release-preparation",
            "Accept": "application/json, application/octet-stream",
        },
    )
    with urllib.request.build_opener(NoRedirects).open(request, timeout=45) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Release response exceeded its size limit")
        return data


def wheel_asset(files, version):
    expected = f"integral_core-{version}-py3-none-any.whl"
    files = [
        f
        for f in files
        if f.get("filename") == expected
        and f.get("packagetype") == "bdist_wheel"
        and not f.get("yanked")
    ]
    if len(files) != 1:
        raise ValueError("Require one non-yanked universal Core wheel")
    asset = files[0]
    parsed = urllib.parse.urlsplit(asset.get("url", ""))
    if (
        parsed.scheme != "https"
        or parsed.hostname
        not in {"files.pythonhosted.org", "test-files.pythonhosted.org"}
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Core wheel must come from the package index's file host")
    if (
        not re.fullmatch(r"[a-f0-9]{64}", asset.get("digests", {}).get("sha256", ""))
        or not isinstance(asset.get("size"), int)
        or not 0 < asset["size"] <= 64 * 1024 * 1024
    ):
        raise ValueError("Require a bounded wheel with a published SHA-256")
    return asset


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def inspect_wheel(wheel, source, version):
    count = 0
    with zipfile.ZipFile(wheel) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or any(
            n.startswith("/")
            or re.match(r"^[A-Za-z]:", n)
            or ".." in Path(n).parts
            or "\\" in n
            for n in names
        ):
            raise ValueError("Unsafe or duplicate Core wheel member")
        if sum(info.file_size for info in archive.infolist()) > 256 * 1024 * 1024:
            raise ValueError("Core wheel expansion is too large")
        metadata = [n for n in names if n.endswith(".dist-info/METADATA")]
        if len(metadata) != 1:
            raise ValueError("Require one Core package metadata record")
        text = archive.read(metadata[0]).decode()
        if (
            f"\nVersion: {version}\n" not in text
            or "\nName: integral-core\n" not in text
            or "\nLicense-Expression: Apache-2.0\n" not in text
        ):
            raise ValueError("Core release metadata does not match")
        for name in names:
            if name.startswith("app/") and name.endswith(".py"):
                original = source / "backend" / name
                if (
                    original.is_symlink()
                    or not original.is_file()
                    or original.read_bytes() != archive.read(name)
                ):
                    raise ValueError(f"Published Core source mismatch: {name}")
                count += 1
        for name in ["LICENSE", "NOTICE"]:
            member = metadata[0].removesuffix("METADATA") + "licenses/" + name
            if archive.read(member) != (source / "backend" / name).read_bytes():
                raise ValueError("Published Core notice does not match its tag")
        if (
            not count
            or not any(n.startswith("app/web/static/") for n in names)
            or not any(n.startswith("app/resident_harness/") for n in names)
        ):
            raise ValueError("Published Core lacks engine, UI or resident assets")
    return count


def snapshot(source, output):
    output.mkdir()
    files = (
        subprocess.check_output(["git", "ls-files", "-z", "frontend"], cwd=source)
        .decode()
        .split("\0")
    )
    for name in filter(None, files):
        rel = Path(name)
        if any(
            part in {"node_modules", "dist", ".env"} or part.startswith(".env.")
            for part in rel.parts
        ):
            continue
        original = source / rel
        if original.is_symlink() or not original.is_file():
            raise ValueError("Unsupported Core UI source")
        target = output / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original, target)
    for name in ["LICENSE", "NOTICE"]:
        shutil.copyfile(source / "backend" / name, output / name)
    shutil.copyfile(source / "scripts/distribution.py", output / "compose.py")
    inventory = {
        p.relative_to(output).as_posix(): digest(p)
        for p in sorted(output.rglob("*"))
        if p.is_file()
    }
    descriptor = {
        "contract_version": 1,
        "source_commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=source, text=True
        ).strip(),
        "source_tree_sha256": hashlib.sha256(
            json.dumps(inventory, sort_keys=True).encode()
        ).hexdigest(),
        "files": inventory,
        "license_state": "Apache-2.0 Core and One; inherited component grants retained",
    }
    write_json(output / "core-source.json", descriptor)
    return descriptor


def write_json(file, value):
    file.write_text(json.dumps(value, indent=2) + "\n")


def prepare(root, policy, version, metadata, source, runtime_only=False):
    asset = wheel_asset(metadata["urls"], version)
    data = download(asset["url"], asset["size"])
    if (
        len(data) != asset["size"]
        or hashlib.sha256(data).hexdigest() != asset["digests"]["sha256"]
    ):
        raise ValueError("Published Core wheel digest/size mismatch")
    with tempfile.TemporaryDirectory(prefix="one-core-source-") as temporary:
        temp = Path(temporary)
        wheel = temp / asset["filename"]
        wheel.write_bytes(data)
        count = inspect_wheel(wheel, source, version)
        descriptor = snapshot(source, temp / "ui")
        tag_commit = subprocess.check_output(
            ["git", "rev-parse", f"v{version}^{{commit}}"], cwd=source, text=True
        ).strip()
        if (
            descriptor["source_commit"] != tag_commit
            or subprocess.check_output(
                ["git", "status", "--porcelain"], cwd=source, text=True
            ).strip()
        ):
            raise ValueError("Require a clean exact Core release tag checkout")
        pins = json.loads((root / "distribution.json").read_text())
        package = json.loads((root / "package.json").read_text())
        lock = json.loads((root / "package-lock.json").read_text())
        old_wheel = root / pins["core"]["base_wheel"]
        target = root / "vendor/core-runtime" / asset["filename"]
        if (
            old_wheel.parent != target.parent
            or old_wheel.is_symlink()
            or target.parent.is_symlink()
        ):
            raise ValueError("Invalid existing Core artifact location")
        if not re.fullmatch(r"\d+\.\d+\.\d+", package["version"]):
            raise ValueError("Require a stable One version before preparing an update")
        parts = package["version"].split(".")
        next_version = package["version"] if runtime_only else ".".join(parts[:2] + [str(int(parts[2]) + 1)])
        pins["product_version"] = package["version"] = lock["version"] = lock[
            "packages"
        ][""]["version"] = next_version
        package.setdefault("integralOneUpdates", {}).update(
            enabled=True,
            channel="development" if policy["registry"] == "testpypi" else "stable",
        )
        pins["core"].update(
            version=version,
            source_commit=tag_commit,
            source_state="Published wheel matches exact Core release tag; consumer qualification required",
            wheel_sha256=asset["digests"]["sha256"],
            wheel_filename=asset["filename"],
            base_wheel=target.relative_to(root).as_posix(),
            ui_manifest_sha256=digest(temp / "ui/core-source.json"),
        )
        provenance_file = root / "docs/SOURCE-PROVENANCE.json"
        provenance = json.loads(provenance_file.read_text())
        provenance["previous_released_core"] = provenance.get("released_core", {})
        provenance["released_core"] = {
            "version": version,
            "source_commit": tag_commit,
            "wheel_sha256": asset["digests"]["sha256"],
            "packaged_python_files_match_source": count,
            "original_license_and_notice_match": True,
            "publication_index": f"{REGISTRIES[policy['registry']]}/project/integral-core/{version}/",
            "ui_source_tree_sha256": descriptor["source_tree_sha256"],
            "qualification": "Automated consumer matrix required; signing, native GUI upgrade and release approval remain separate",
        }
        shutil.copyfile(wheel, target)
        if old_wheel != target:
            old_wheel.unlink()
        destination = root / "vendor/core-ui-source"
        if destination.is_symlink():
            raise ValueError("Core UI destination cannot be a symlink")
        shutil.rmtree(destination)
        shutil.copytree(temp / "ui", destination)
        for name, value in [
            ("distribution.json", pins),
            ("package.json", package),
            ("package-lock.json", lock),
            ("docs/SOURCE-PROVENANCE.json", provenance),
        ]:
            write_json(root / name, value)
        write_json(
            root / "docs/CORE-UPDATE-CANDIDATE.json",
            {
                "core_version": version,
                "one_version": next_version,
                "core_commit": tag_commit,
                "registry": policy["registry"],
                "wheel_sha256": asset["digests"]["sha256"],
                "automatic_publication": bool(runtime_only and policy.get("automaticPublication")),
                "delivery": "qualified-runtime" if runtime_only else "qualified-one-release",
            },
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "prepare"])
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--version")
    parser.add_argument("--source", type=Path)
    parser.add_argument("--runtime-only", action="store_true", help="Prepare Core/UI pins without bumping the native host version")
    args = parser.parse_args()
    root = args.root.resolve()
    pins = json.loads((root / "distribution.json").read_text())
    policy = json.loads((root / "core-update-policy.json").read_text())
    if policy.get("registry") not in REGISTRIES:
        raise ValueError("Unknown Core registry")
    index = REGISTRIES[policy["registry"]]
    metadata = json.loads(download(f"{index}/pypi/integral-core/json", 8 * 1024 * 1024))
    version = select_release(
        metadata["releases"], pins["core"]["version"], policy, args.version
    )
    if args.command == "prepare":
        if not version or not args.source:
            raise ValueError(
                "A newer eligible publication and its exact source checkout are required"
            )
        detail = json.loads(
            download(f"{index}/pypi/integral-core/{version}/json", 1024 * 1024)
        )
        prepare(root, policy, version, detail, args.source.resolve(), runtime_only=args.runtime_only)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(
                f"changed={'true' if version else 'false'}\nversion={version or ''}\n"
            )
    print(
        json.dumps(
            {
                "newer_published_core": version,
                "registry": policy["registry"],
                "prepared": args.command == "prepare",
            }
        )
    )


if __name__ == "__main__":
    main()
