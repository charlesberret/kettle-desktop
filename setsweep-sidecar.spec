# PyInstaller spec for the bundled setsweep web-server sidecar.
# Run via scripts/build-sidecar.sh (sets SETSWEEP_SRC to the setsweep repo).

import os
from pathlib import Path

block_cipher = None

setsweep_src = Path(os.environ["SETSWEEP_SRC"]).resolve()
entry = Path(SPECPATH).resolve() / "sidecar_entry.py"

a = Analysis(
    [str(entry)],
    pathex=[str(setsweep_src)],
    binaries=[],
    datas=[
        (str(setsweep_src / "static"), "static"),
        (str(setsweep_src / "kits"), "kits"),
    ],
    hiddenimports=["server", "runtime", "lineage", "kits"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["app", "webview", "pywebview"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="setsweep-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="setsweep-sidecar",
)
