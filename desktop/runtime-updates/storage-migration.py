"""Delegate reviewed native maintenance to the selected Core artifact.

Core owns process locks, quarantine, catalog planning and role adoption. The host
retains its cold snapshot, identity checks, trial and rollback protocol. Imports
stay lazy so host-only tests and an older bundled runtime can load the adapter.
"""


def __getattr__(name):
    if name not in {"prepare", "apply_reviewed", "private_database"}:
        raise AttributeError(name)
    from app.services.storage_indexes import native_upgrade

    return getattr(native_upgrade, name)


def main(argv=None):
    from app.services.storage_indexes.native_upgrade import main as core_main

    return core_main(argv)


if __name__ == "__main__":
    raise SystemExit(main())
