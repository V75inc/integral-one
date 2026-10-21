"""Production-origin setup never targets a different instance or loses origins."""

import importlib.util
import io
import pathlib
import unittest
import urllib.error
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location(
    "clerk_origin", pathlib.Path(__file__).parents[1] / "scripts/configure-clerk-origin.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
FAKE_KEY = "sk_live_synthetic_test_only"


class ClerkOriginTests(unittest.TestCase):
    def test_successful_empty_patch_response_is_accepted_for_separate_readback(self):
        opener = Mock()
        opener.open.return_value = io.BytesIO(b'')
        with patch.object(module.urllib.request, "build_opener", return_value=opener):
            self.assertIsNone(module.api(FAKE_KEY, "PATCH", {"allowed_origins": [module.ORIGIN]}))

    def test_api_identifies_the_setup_client_without_using_the_default_python_agent(self):
        opener = Mock()
        opener.open.return_value = io.BytesIO(b'{"id":"synthetic"}')
        with patch.object(module.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(module.api(FAKE_KEY, "GET"), {"id": "synthetic"})
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, module.ENDPOINT)
        self.assertTrue(request.get_header("User-agent").startswith("IntegralOneSetup/"))
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 20)

    def test_error_reports_step_and_code_without_credentials(self):
        raw = ('{"errors":[{"code":"insufficient_permissions","message":"Denied",'
               '"long_message":"Bearer ' + FAKE_KEY + ' lacks permission"}]}').encode()
        error = urllib.error.HTTPError(module.ENDPOINT, 403, "Forbidden", {}, io.BytesIO(raw))
        result = str(module.safe_error(error, FAKE_KEY, "GET"))
        self.assertIn("GET /v1/instance", result)
        self.assertIn("insufficient_permissions", result)
        self.assertNotIn(FAKE_KEY, result)
        self.assertNotIn("Bearer", result)

    def test_preserves_existing_origins_and_reads_back(self):
        state = {"id": module.INSTANCE, "allowed_origins": ["https://onintegral.ai"]}
        calls = []

        def request(key, method, body=None):
            self.assertEqual(key, FAKE_KEY)
            calls.append(method)
            if body:
                self.assertEqual(set(body), {"allowed_origins"})
                state.update(body)
            return state.copy()

        self.assertTrue(module.configure(FAKE_KEY, request))
        self.assertEqual(calls, ["GET", "PATCH", "GET"])
        self.assertEqual(state["allowed_origins"], ["https://onintegral.ai", module.ORIGIN])
        calls.clear()
        self.assertFalse(module.configure(FAKE_KEY, request))
        self.assertEqual(calls, ["GET"])

    def test_refuses_wrong_instance_missing_list_and_bad_list_before_write(self):
        for state in [
            {"id": "ins_other", "allowed_origins": []},
            {"id": module.INSTANCE},
            {"id": module.INSTANCE, "allowed_origins": "*"},
        ]:
            with self.subTest(state=state):
                calls = []

                def request(key, method, body=None):
                    calls.append(method)
                    return state

                with self.assertRaises(ValueError):
                    module.configure(FAKE_KEY, request)
                self.assertEqual(calls, ["GET"])

    def test_readback_failure_is_not_reported_as_success(self):
        calls = []

        def request(key, method, body=None):
            calls.append(method)
            return {"id": module.INSTANCE, "allowed_origins": []}

        with self.assertRaises(ValueError):
            module.configure(FAKE_KEY, request)
        self.assertEqual(calls, ["GET", "PATCH", "GET"])

    def test_rejects_development_key_without_request(self):
        def forbidden(*args):
            self.fail("No API call is permitted with a development key")

        with self.assertRaises(ValueError):
            module.configure("sk_test_synthetic_test_only", forbidden)


if __name__ == "__main__":
    unittest.main()
