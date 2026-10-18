# Your existing installation

Integral One keeps the application ID **`ai.integral.desktop`** and the user-data directory name **`Integral`**. The display name and branding do not rename your workspace, installation ID, encryption keys or records.

## Before updating

Quit the app and take a consistent supported backup. Keep the original data directory until the replacement build opens successfully and your records can be read. Do not merge installations, rename key files or switch database engines by hand. Uninstalling an application must not be treated as permission to delete its data.

For development and qualification, `--home` selects a separate Core installation and `--user-data-dir` selects a separate Electron profile. See [developer setup](DEVELOPMENT.md).

## Accounts and local data

Clerk signup/sign-in and durable offline receipts are implemented and development-qualified. Production account configuration remains a release gate. The verified account's display email is separate from Core's stable local owner ID; signing in does not replace the owner or move records to the cloud.

## Backup and recovery

The currently qualified backup/recovery path uses the Core CLI. It preserves the installation identity, local records/files and encryption keys. Restore targets an **empty home**, rotates session authority, and quarantines the restored installation until the required authorization review is applied.

Core's backup archive does **not** include One's separate `one-account/activation.json` receipt. Preserve the complete `one-account` directory privately alongside the backup for offline recovery, or sign into the same account again to obtain a receipt bound to the retained installation. Do not publish backups, receipt files or keys in an issue.

Desktop backup/restore convenience and clean-machine upgrade/recovery remain launch work. See [first-release qualification](FIRST-RELEASE-QUALIFICATION.md) for the actual checks and limitations; request maintainer assistance before attempting recovery of a real workspace.
