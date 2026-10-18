"""Owner-private runtime directories, including restricted Windows processes."""

from __future__ import annotations

import csv
import ctypes
import io
import os
import re
import subprocess
from pathlib import Path


def _windows_private_directory(path: Path) -> None:
    """Use the token user, not an elevated token's Administrators owner group."""
    from ctypes import wintypes

    identity = subprocess.check_output(
        [
            str(Path(os.environ["SystemRoot"]) / "System32/whoami.exe"),
            "/user",
            "/fo",
            "csv",
            "/nh",
        ],
        text=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    sid = next(csv.reader(io.StringIO(identity)))[1]
    if not re.fullmatch(r"S-1-\d+(?:-\d+)+", sid):
        raise OSError("Could not resolve the Windows runtime user SID")
    # Protected DACL: only this user, SYSTEM and machine administrators.
    # PostgreSQL drops the Administrators group from its process token; an
    # explicit user SID retains access without granting Users/Everyone access.
    sddl = f"D:P(A;OICI;FA;;;{sid})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)"
    advapi = ctypes.WinDLL("advapi32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    convert = advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW
    convert.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(wintypes.DWORD),
    ]
    convert.restype = wintypes.BOOL
    apply = advapi.SetFileSecurityW
    apply.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p]
    apply.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    descriptor = ctypes.c_void_p()
    if not convert(sddl, 1, ctypes.byref(descriptor), None):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        # DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION
        if not apply(str(path), 0x80000004, descriptor):
            raise ctypes.WinError(ctypes.get_last_error())
    finally:
        kernel.LocalFree(descriptor)


def private_directory(path: Path) -> None:
    """Protect a directory before writing any runtime secrets or database data."""
    if os.name == "nt":
        _windows_private_directory(path)
    else:
        path.chmod(0o700)
