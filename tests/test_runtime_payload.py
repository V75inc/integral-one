import hashlib
import importlib.util
import json
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


validator = load("runtime_payload_validator", ROOT / "desktop/runtime-updates/payload.py")
composer = load("runtime_payload_composer", ROOT / "scripts/compose-runtime.py")


class RuntimePayloadTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        base = root / "upstream.whl"
        name = "integral_core-0.1.1rc36-py3-none-any.whl"
        wheel = root / name
        with zipfile.ZipFile(base, "w") as archive:
            archive.writestr("app/demo.py", "# unchanged engine\n")
            archive.writestr("integral_core-0.1.1rc36.dist-info/METADATA", "Metadata-Version: 2.4\nName: integral-core\nVersion: 0.1.1rc36\nLicense-Expression: Apache-2.0\n")
            archive.writestr("integral_core-0.1.1rc36.dist-info/LICENSE", "Apache license retained")
            archive.writestr("integral_core-0.1.1rc36.dist-info/RECORD", "")
            archive.writestr("app/web/static/index.html", "upstream UI")
        ui = root / "ui"
        ui.mkdir()
        (ui / "index.html").write_text("One host UI")
        sha = hashlib.sha256(base.read_bytes()).hexdigest()
        composer.compose(base, ui, wheel, sha)
        manifest = {"core": {"version": "0.1.1rc36", "wheelSha256": sha}, "wheel": {"file": name, "sha256": hashlib.sha256(wheel.read_bytes()).hexdigest()}}
        return root, base, wheel, manifest

    def bundle(self, root, wheel, manifest, extras=None):
        payload = root / "runtime.zip"
        with zipfile.ZipFile(payload, "w") as archive:
            archive.write(wheel, wheel.name)
            archive.writestr("notices/THIRD-PARTY-NOTICES.txt", "Licensed dependencies")
            for name, content in extras or []:
                archive.writestr(name, content)
        manifest["payload"] = {"sha256": hashlib.sha256(payload.read_bytes()).hexdigest(), "bytes": payload.stat().st_size}
        descriptor = root / "manifest.json"
        descriptor.write_text(json.dumps(manifest))
        return payload, descriptor

    def test_extracts_only_verified_engine_one_ui_and_notices(self):
        with tempfile.TemporaryDirectory() as directory:
            root, base, wheel, manifest = self.fixture(directory)
            payload, descriptor = self.bundle(root, wheel, manifest)
            validator.extract(payload, base, descriptor, root / "staged")
            self.assertTrue((root / "staged" / wheel.name).is_file())
            self.assertTrue((root / "staged/notices/THIRD-PARTY-NOTICES.txt").is_file())

    def test_rejects_engine_or_original_license_changes(self):
        for name in ["app/demo.py", "integral_core-0.1.1rc36.dist-info/LICENSE"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root, base, wheel, manifest = self.fixture(directory)
                with zipfile.ZipFile(wheel) as archive:
                    files = {item: archive.read(item) for item in archive.namelist()}
                files[name] = b"changed"
                with zipfile.ZipFile(wheel, "w") as archive:
                    for item, content in files.items():
                        archive.writestr(item, content)
                with self.assertRaisesRegex(ValueError, "engine or licenses"):
                    validator.verify_wheel(wheel, base, manifest)

    def test_rejects_traversal_symlinks_foreign_files_and_changed_payload(self):
        link = zipfile.ZipInfo("notices/link")
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        for extras in [[("../escape", "bad")], [("/absolute", "bad")], [("notices/../escape", "bad")], [(link, "target")], [("activation.json", "private")]]:
            with self.subTest(extras=str(extras)), tempfile.TemporaryDirectory() as directory:
                root, base, wheel, manifest = self.fixture(directory)
                payload, descriptor = self.bundle(root, wheel, manifest, extras)
                with self.assertRaises(ValueError):
                    validator.extract(payload, base, descriptor, root / "staged")
                self.assertFalse((root / "escape").exists())
        with tempfile.TemporaryDirectory() as directory:
            root, base, wheel, manifest = self.fixture(directory)
            payload, descriptor = self.bundle(root, wheel, manifest)
            payload.write_bytes(payload.read_bytes() + b"changed")
            with self.assertRaisesRegex(ValueError, "changed before extraction"):
                validator.extract(payload, base, descriptor, root / "staged")
            self.assertFalse((root / "staged").exists())

    def test_rejects_modified_ui_inventory_and_case_collisions(self):
        with tempfile.TemporaryDirectory() as directory:
            root, base, wheel, manifest = self.fixture(directory)
            with zipfile.ZipFile(wheel) as archive:
                files = {name: archive.read(name) for name in archive.namelist()}
            files["app/web/static/index.html"] = b"changed UI"
            with zipfile.ZipFile(wheel, "w") as archive:
                for name, content in files.items():
                    archive.writestr(name, content)
            with self.assertRaisesRegex(ValueError, "UI integrity"):
                validator.verify_wheel(wheel, base, manifest)
        with tempfile.TemporaryDirectory() as directory:
            root, base, wheel, manifest = self.fixture(directory)
            payload, descriptor = self.bundle(root, wheel, manifest, [("notices/NOTICE", "a"), ("notices/notice", "b")])
            with self.assertRaisesRegex(ValueError, "duplicate"):
                validator.extract(payload, base, descriptor, root / "staged")


if __name__ == "__main__":
    unittest.main()
