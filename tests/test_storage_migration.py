"""Opt-in real PostgreSQL qualification; the DSN must name an isolated cluster."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import uuid
from urllib.parse import urlsplit, urlunsplit

path = Path(__file__).resolve().parents[1] / "desktop/runtime-updates/storage-migration.py"
spec = importlib.util.spec_from_file_location("one_storage_migration", path)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


@unittest.skipUnless(os.getenv("ONE_STORAGE_TEST_DSN"), "disposable PostgreSQL DSN required")
class ManagedMigrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import asyncpg
        self.admin = await asyncpg.connect(os.environ["ONE_STORAGE_TEST_DSN"])
        self.database = "one_migration_test_" + uuid.uuid4().hex[:12]
        await self.admin.execute(f'CREATE DATABASE "{self.database}"')
        parsed = urlsplit(os.environ["ONE_STORAGE_TEST_DSN"])
        self.dsn = urlunsplit(parsed._replace(path="/" + self.database))
        self.conn = await asyncpg.connect(self.dsn)
        self.temp = tempfile.TemporaryDirectory(prefix="one-storage-test-")
        self.home = Path(self.temp.name)
        self.config = {"contract_version": 1, "deployment_profile": "desktop_single_user",
                       "installation_id": "fixture-installation", "jwt_key": "fixture-old-key"}
        (self.home / "installation.json").write_text(json.dumps(self.config))
        self.attachment = self.home / "attachment.bin"
        self.attachment.write_bytes(b"\x00\xfforiginal attachment\x80")
        self.role = None
        self.addAsyncCleanup(self.cleanup)
        from app.services.storage_indexes.catalog import collection_sql
        for sql in collection_sql("public"):
            await self.conn.execute(sql)
        await self.conn.execute("INSERT INTO public.object(id,entity,data) VALUES('retained','FixtureRecord',$1::jsonb)", json.dumps({"context": {"body": "retained record", "attachment": "attachment.bin"}}))
        self.role = None

    async def cleanup(self):
        await self.conn.close()
        await self.admin.execute(f'DROP DATABASE "{self.database}" WITH (FORCE)')
        if self.role:
            await self.admin.execute(f'DROP ROLE IF EXISTS "{self.role}"')
        await self.admin.close()
        self.temp.cleanup()

    async def plan(self):
        result = await migration.prepare(self.conn, self.home, "a" * 64, {
            "max_indexes": 2000, "max_index_bytes": 2_000_000_000, "max_build_bytes": 3_000_000_000})
        self.role = result["plan"]["runtime_role"]
        return result

    async def test_populated_interrupted_retry_is_restricted_and_preserves_data(self):
        import asyncpg
        envelope = await self.plan()
        original = await self.conn.fetchval("SELECT data::text FROM object WHERE id='retained'")
        parent = self.conn
        class InterruptedConnection:
            builds = 0
            def __getattr__(self, key):
                return getattr(parent, key)
            async def execute(self, sql, *args, **kwargs):
                if sql.startswith(("CREATE INDEX", "CREATE UNIQUE INDEX")):
                    self.builds += 1
                    if self.builds == 3:
                        raise RuntimeError("injected interrupted index build")
                return await parent.execute(sql, *args, **kwargs)
        with self.assertRaisesRegex(RuntimeError, "injected interrupted"):
            await migration.apply_reviewed(InterruptedConnection(), self.dsn, self.home, envelope, "a" * 64)
        self.assertEqual(json.loads((self.home / "installation.json").read_text()), self.config)
        result = await migration.apply_reviewed(self.conn, self.dsn, self.home, envelope, "a" * 64)
        self.assertEqual(result, await migration.apply_reviewed(self.conn, self.dsn, self.home, envelope, "a" * 64))
        config = json.loads((self.home / "installation.json").read_text())
        self.assertEqual({k: v for k, v in config.items() if not k.startswith("runtime_database_")}, self.config)
        self.assertEqual(await self.conn.fetchval("SELECT data::text FROM object WHERE id='retained'"), original)
        self.assertEqual(self.attachment.read_bytes(), b"\x00\xfforiginal attachment\x80")
        from app.services.storage_indexes.provision import initial_install
        resumed_dsn = await initial_install(self.dsn, runtime_role=config["runtime_database_user"],
                                            runtime_password=config["runtime_database_password"],
                                            plan_path=self.home / "storage-initial-plan.json")
        self.assertFalse((self.home / "storage-initial-plan.json").exists(), "startup must not create a new plan")
        runtime = await asyncpg.connect(resumed_dsn)
        try:
            self.assertEqual(await runtime.fetchval("SELECT data::text FROM object WHERE id='retained'"), original)
            with self.assertRaises(asyncpg.InsufficientPrivilegeError):
                await runtime.execute("CREATE TABLE forbidden(id text)")
            with self.assertRaises(asyncpg.InsufficientPrivilegeError):
                await runtime.execute("DELETE FROM integral_index_catalog")
        finally:
            await runtime.close()

    async def test_wrong_runtime_or_changed_installation_fails_before_role_creation(self):
        envelope = await self.plan()
        with self.assertRaisesRegex(ValueError, "another home or runtime"):
            await migration.apply_reviewed(self.conn, self.dsn, self.home, envelope, "b" * 64)
        (self.home / "installation.json").write_text(json.dumps({**self.config, "runtime_database_user": self.role}))
        with self.assertRaisesRegex(ValueError, "Incomplete runtime credentials"):
            await migration.apply_reviewed(self.conn, self.dsn, self.home, envelope, "a" * 64)
        config = {**self.config, "jwt_key": "changed"}
        (self.home / "installation.json").write_text(json.dumps(config))
        with self.assertRaisesRegex(ValueError, "changed after migration review"):
            await migration.apply_reviewed(self.conn, self.dsn, self.home, envelope, "a" * 64)
        self.assertFalse(await self.conn.fetchval("SELECT 1 FROM pg_roles WHERE rolname=$1", self.role))
        self.assertFalse((self.home / "storage-upgrade-credential.json").exists())


if __name__ == "__main__":
    unittest.main()
