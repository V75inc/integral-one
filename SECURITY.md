# Security reporting

Please report vulnerabilities privately. Do not include exploit details, account tokens, provider keys, databases or private records in public issues.

Use GitHub's **Report a vulnerability** action if it is available on this repository's Security page. For privacy or account requests, contact **support@v75inc.com**. If private vulnerability reporting is unavailable, open an issue requesting a private maintainer contact without describing the vulnerability. A dedicated security contact and supported-release policy will be published before a production launch.

## Current support status

Integral One is a development preview, not a signed production release. Include your One version, operating system, architecture and whether the issue affects local records, account signup or offline access. Preserve installation keys and data when reproducing a problem; use a separate test home.

## Security boundaries

- The local Core API requires authentication; the native installation controller secret is not exposed to renderer content.
- Clerk account identity does not grant another user access to an existing local workspace.
- Continued offline access is intentional. Sign-out is not a filesystem lock against another person using the same OS account.
- Hosted AI providers receive the prompts and selected context needed for requests you send to them.

See [release gates](docs/RELEASE-GATES.md) for outstanding production qualification.
