import base64
import csv
import hashlib
import importlib.util
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "compose_runtime", ROOT / "scripts/compose-runtime.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RuntimeComposition(unittest.TestCase):
    def fixture(self, root):
        base = root / "core.whl"
        ui = root / "ui"
        ui.mkdir()
        (ui / "index.html").write_text("Integral | one")
        with zipfile.ZipFile(base, "w") as wheel:
            for name, value in {
                "app/engine.py": b"preserved engine",
                "app/web/static/index.html": b"old ui",
                "core.dist-info/METADATA": b"License-Expression: Apache-2.0\n",
                "core.dist-info/licenses/LICENSE": b"Apache original",
                "core.dist-info/licenses/NOTICE": b"Original notice",
                "core.dist-info/RECORD": b"",
            }.items():
                wheel.writestr(name, value)
        return base, ui, hashlib.sha256(base.read_bytes()).hexdigest()

    def test_engine_notices_record_and_reproducibility(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            base, ui, sha = self.fixture(root)
            for out in ["one.whl", "two.whl"]:
                module.compose(base, ui, root / out, sha)
            self.assertEqual(
                (root / "one.whl").read_bytes(), (root / "two.whl").read_bytes()
            )
            with zipfile.ZipFile(root / "one.whl") as wheel:
                self.assertEqual(wheel.read("app/engine.py"), b"preserved engine")
                self.assertEqual(
                    wheel.read("core.dist-info/licenses/NOTICE"), b"Original notice"
                )
                self.assertIn(
                    b"Integral | one", wheel.read("app/web/static/index.html")
                )
                for name, digest, size in csv.reader(
                    io.StringIO(wheel.read("core.dist-info/RECORD").decode())
                ):
                    if not digest:
                        continue
                    value = wheel.read(name)
                    encoded = (
                        base64.urlsafe_b64encode(hashlib.sha256(value).digest())
                        .rstrip(b"=")
                        .decode()
                    )
                    self.assertEqual(digest, "sha256=" + encoded)
                    self.assertEqual(int(size), len(value))

    def test_wrong_base_or_unbuilt_ui_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            base, ui, sha = self.fixture(root)
            with self.assertRaises(ValueError):
                module.compose(base, ui, root / "one.whl", "bad")
            (ui / "index.html").unlink()
            with self.assertRaises(ValueError):
                module.compose(base, ui, root / "one.whl", sha)
            self.assertFalse((root / "one.whl").exists())

    def test_ui_symlink_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            base, ui, sha = self.fixture(root)
            try:
                (ui / "linked").symlink_to(base)
            except OSError:
                self.skipTest("OS symlink permission unavailable")
            with self.assertRaises(ValueError):
                module.compose(base, ui, root / "one.whl", sha)


if __name__ == "__main__":
    unittest.main()
