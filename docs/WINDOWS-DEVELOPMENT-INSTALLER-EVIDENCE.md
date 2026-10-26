# Windows development installer evidence

22 October 2026. Candidate version `0.1.2`. This note records the host builds and the guest installs reported in this session. It is not a public install guide.

The VM was not opened from this session. Guest results below are the maintainer's report.

## Builds

Host toolchain: Node `v24.13.1`, `PYTHON` = `C:\Program Files\Python312\python.exe` (3.12.10), `INTEGRAL_UV_BINARY` = `C:\v75\integral-one\.local\uv-0.13.4\uv.exe` (`uv 0.13.4`). `ONE_WINDOWS_CERT_SHA1`, `CSC_LINK`, and `CSC_KEY_PASSWORD` were unset. Neither build passed `--signed`.

| Build | Account config baked in | Exe | Package inspection |
| --- | --- | --- | --- |
| 11:20 | Checked-in file, `configured: false` | `C:\v75\integral-one\release\integral-one-0.1.2-win-x64.exe` (140,785,199 bytes) | pass, `signing: not qualified`, asar `b793110f438a39b8c4d14347dcdf7ff590f16a2669010bab25d381b546bd5714` |
| 11:49 | `desktop/accounts/config.production.json` via `INTEGRAL_ACCOUNT_CONFIG` | Same path, replaced (140,785,246 bytes, 11:49:50) | pass, `signing: not qualified`, asar `590e6966ae7cadd7ba3bfa6f9f5e53faa647e46a22bccea4756c2743f17c1249` |

Both logs ended with: `Development installer built. It cannot pass the public bootstrap signature/release gates.`

The 11:49 build is the one installed on the VM. The checked-in `desktop/accounts/config.json` is still `configured: false`. Host `%APPDATA%\Integral` was absent after both builds.

## Guest

| Check | Result | Record |
| --- | --- | --- |
| Sandbox install of the 11:20 exe | pass | The account window showed: "Account signup is unavailable in this preview. Existing local data is preserved." |
| VM install of the 11:49 exe | pass | Maintainer reports the install works. VM product name was not recorded. |
| Administrator elevation | not tested | No elevation prompt was quoted. |
| SmartScreen and other Windows security prompts | not tested | No prompt text was quoted. |
| Desktop shortcut | not tested | Not reported. |
| Start menu shortcut | not tested | Not reported. |
| Install directory | not tested | Not reported. |
| Guest `%APPDATA%\Integral` exists | pass | Maintainer reports the folder is visible in the VM. |
| Closed-app second run leaves that folder in place | not tested | A second run with the app closed was not described. The folder being present shows that local data was created. |
| Signup | not tested | The 11:20 build stopped on the unconfigured account gate. The 11:49 build can offer production signup; completion was not recorded. |
| Runtime download | not tested | |
| Offline restart | not tested | |
| Authenticode | not tested | Signing was skipped. `signing` remained `not qualified`. |
| Public release | not tested | No manifest publication or workflow dispatch. |

## Release switches

`include_windows` remains `false` in `.github/workflows/installer-candidate.yml`. `install/install.ps1` was not retargeted at this exe. No release was published.
