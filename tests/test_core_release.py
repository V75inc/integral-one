import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "core_release", Path(__file__).resolve().parents[1] / "scripts/core_release.py"
)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class CorePublicationTests(unittest.TestCase):
    def policy(self, **changes):
        return {
            "schemaVersion": 1,
            "registry": "testpypi",
            "series": "0.1",
            "allowPrereleases": True,
            "delivery": "qualified-one-release",
            "automaticPublication": False,
            **changes,
        }

    def asset(self, version, **changes):
        return {
            "filename": f"integral_core-{version}-py3-none-any.whl",
            "packagetype": "bdist_wheel",
            "yanked": False,
            "url": "https://test-files.pythonhosted.org/packages/core.whl",
            "size": 123,
            "digests": {"sha256": "a" * 64},
            **changes,
        }

    def test_numeric_release_order_and_no_downgrades(self):
        values = [
            "0.1.1rc9",
            "0.1.1rc10",
            "0.1.1",
            "0.1.2a1",
            "0.1.2b1",
            "0.1.2rc1",
            "0.1.2",
        ]
        self.assertEqual(sorted(reversed(values), key=release.version_key), values)
        versions = {
            v: [self.asset(v)]
            for v in ["0.1.1rc29", "0.1.1rc30", "0.2.0", "0.1.1.dev99"]
        }
        self.assertEqual(
            release.select_release(versions, "0.1.1rc28", self.policy()), "0.1.1rc30"
        )
        self.assertIsNone(release.select_release(versions, "0.1.1rc30", self.policy()))

    def test_stable_channel_yanked_and_missing_wheels(self):
        versions = {
            "0.1.1rc30": [self.asset("0.1.1rc30")],
            "0.1.1": [self.asset("0.1.1", yanked=True)],
            "0.1.2": [],
        }
        self.assertIsNone(
            release.select_release(
                versions, "0.1.1rc28", self.policy(allowPrereleases=False)
            )
        )
        versions["0.1.1"][0]["yanked"] = False
        self.assertEqual(
            release.select_release(
                versions, "0.1.1rc28", self.policy(allowPrereleases=False)
            ),
            "0.1.1",
        )

    def test_requested_unpublished_old_or_wrong_series_rejected(self):
        versions = {
            "0.1.1rc29": [self.asset("0.1.1rc29")],
            "0.2.0": [self.asset("0.2.0")],
        }
        for requested in [
            "0.1.1rc28",
            "0.1.1rc99",
            "0.2.0",
            "../main",
            "0.1.1rc29\ninjected=true",
        ]:
            with self.subTest(requested=requested), self.assertRaises(ValueError):
                release.select_release(versions, "0.1.1rc28", self.policy(), requested)

    def test_unbounded_or_foreign_downloads_rejected(self):
        self.assertEqual(
            release.wheel_asset([self.asset("0.1.1rc29")], "0.1.1rc29")["size"], 123
        )
        for changes in [
            {"url": "http://files.pythonhosted.org/core.whl"},
            {"url": "https://evil.example/core.whl"},
            {"url": "https://files.pythonhosted.org/core.whl?token=private"},
            {"size": 0},
            {"size": 100_000_000},
            {"digests": {"sha256": "missing"}},
            {"yanked": True},
        ]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                release.wheel_asset([self.asset("0.1.1rc29", **changes)], "0.1.1rc29")

    def test_policy_never_enables_unreviewed_publication(self):
        for changes in [
            {"registry": "arbitrary-index"},
            {"automaticPublication": True},
            {"delivery": "hot-swap"},
        ]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                release.select_release({}, "0.1.1rc28", self.policy(**changes))

    def test_wheel_engine_and_notices_must_match_exact_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, data in {
                "app/engine.py": b"approved engine",
                "LICENSE": b"Apache",
                "NOTICE": b"attribution",
            }.items():
                target = root / "backend" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            members = {
                "app/engine.py": b"approved engine",
                "app/web/static/index.html": b"web",
                "app/resident_harness/skills/a.md": b"skill",
                "integral_core-0.1.1rc29.dist-info/METADATA": b"Metadata-Version: 2.4\nName: integral-core\nVersion: 0.1.1rc29\nLicense-Expression: Apache-2.0\n",
                "integral_core-0.1.1rc29.dist-info/licenses/LICENSE": b"Apache",
                "integral_core-0.1.1rc29.dist-info/licenses/NOTICE": b"attribution",
            }
            wheel = root / "core.whl"
            for changed in [False, True]:
                with zipfile.ZipFile(wheel, "w") as archive:
                    for name, data in members.items():
                        archive.writestr(
                            name,
                            (
                                b"different engine"
                                if changed and name == "app/engine.py"
                                else data
                            ),
                        )
                if changed:
                    with self.assertRaisesRegex(ValueError, "source mismatch"):
                        release.inspect_wheel(wheel, root, "0.1.1rc29")
                else:
                    self.assertEqual(release.inspect_wheel(wheel, root, "0.1.1rc29"), 1)


if __name__ == "__main__":
    unittest.main()
