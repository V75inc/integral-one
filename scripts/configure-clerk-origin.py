"""Owner-run setup for the approved Integral production desktop origin.

No key is accepted in arguments, environment variables or files. The owner enters
it in their terminal. The instance is checked before any write; existing origins
are retained and the result is read back. This script is not packaged in One.
"""

import getpass
import json
import re
import sys
import urllib.error
import urllib.request

INSTANCE = "ins_3Kzh4GVZ5Dnc4Eb5h72BmOnnwSM"
ORIGIN = "integral-one://account"
ENDPOINT = "https://api.clerk.com/v1/instance"


class ApiFailure(Exception):
    """Safe provider diagnostic without credential or request-header objects."""


def safe_error(error, secret, method):
    """Retain only bounded Clerk error fields, redacting credential-shaped text."""
    details = []
    try:
        raw = error.read(65536)
        error.close()
        payload = json.loads(raw)
        for item in payload.get("errors", [])[:3]:
            if not isinstance(item, dict):
                continue
            for name in ("code", "message", "long_message"):
                value = item.get(name)
                if isinstance(value, str):
                    value = re.sub(r"(?:sk_(?:live|test)_|Bearer\s+)[A-Za-z0-9_.-]+", "[redacted]", value)
                    value = value.replace(secret, "[redacted]")
                    details.append(" ".join(value.split())[:300])
    except (ValueError, AttributeError, TypeError):
        pass
    suffix = ": " + " | ".join(details) if details else " (no usable Clerk error code returned)"
    return ApiFailure(f"Clerk {method} /v1/instance rejected (HTTP {error.code}){suffix}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward the credential to a redirected endpoint."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api(secret, method, body=None):
    request = urllib.request.Request(
        ENDPOINT,
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={
            "Authorization": "Bearer " + secret,
            "Content-Type": "application/json",
            "User-Agent": "IntegralOneSetup/0.1 (+https://github.com/V75inc/integral-one)",
        },
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
            raw = response.read(1024 * 1024 + 1)
    except urllib.error.HTTPError as error:
        raise safe_error(error, secret, method) from None
    if len(raw) > 1024 * 1024:
        raise ValueError("Unexpected Clerk response size; no further action taken.")
    # Clerk's instance update returns no JSON body. Verification is the separate
    # GET below; an empty successful PATCH must not be reported as a failure.
    if not raw and method == "PATCH":
        return None
    return json.loads(raw)


def configure(secret, request=api):
    """Add one exact origin to the exact production instance; verify the result."""
    if not secret.startswith("sk_live_") or len(secret) < 20:
        raise ValueError("Use an Integral production Clerk secret key.")
    before = request(secret, "GET")
    if before.get("id") != INSTANCE:
        raise ValueError("Key belongs to a different instance; no change made.")
    if "allowed_origins" not in before:
        raise ValueError("Clerk returned no origin list; no change made.")
    existing = before["allowed_origins"]
    if existing is None:
        existing = []
    if not isinstance(existing, list) or not all(isinstance(x, str) for x in existing):
        raise ValueError("Clerk returned an invalid origin list; no change made.")
    if ORIGIN in existing:
        return False
    expected = [*existing, ORIGIN]
    request(secret, "PATCH", {"allowed_origins": expected})
    after = request(secret, "GET")
    if after.get("id") != INSTANCE or after.get("allowed_origins") != expected:
        raise ValueError("Origin readback differs; inspect the instance before retrying.")
    return True


def main():
    """Prompt only in the owner's interactive terminal and never echo the key."""
    if len(sys.argv) != 1 or not sys.stdin.isatty():
        raise SystemExit("Run directly in your terminal, with no arguments.")
    print("Integral production: add only integral-one://account; retain existing origins.")
    print("Paste the production Clerk secret key below. It will not be echoed or stored.")
    secret = getpass.getpass("Clerk key (hidden): ")
    try:
        changed = configure(secret)
    finally:
        secret = ""
    print("Origin added and verified." if changed else "Origin already configured; no change needed.")


if __name__ == "__main__":
    try:
        main()
    except ApiFailure as error:
        raise SystemExit(str(error))
    except (ValueError, urllib.error.URLError, TimeoutError):
        raise SystemExit("Setup could not be verified. Check the key/connection and review the instance; no credential printed.")
