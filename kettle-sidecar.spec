# PyInstaller spec for the bundled kettle web-server sidecar.
# Run via scripts/build-sidecar.sh (sets KETTLE_SRC to the kettle repo).

import os
from pathlib import Path

block_cipher = None

kettle_src = Path(os.environ["KETTLE_SRC"]).resolve()
entry = Path(SPECPATH).resolve() / "sidecar_entry.py"

a = Analysis(
    [str(entry)],
    pathex=[str(kettle_src)],
    binaries=[],
    datas=[
        (str(kettle_src / "static"), "static"),
        (str(kettle_src / "kits"), "kits"),
        (str(kettle_src / "pyproject.toml"), "."),
    ],
    hiddenimports=["server", "kettle_contract", "runtime", "lineage", "kits"],
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
    name="kettle-sidecar",
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
    name="kettle-sidecar",
)
