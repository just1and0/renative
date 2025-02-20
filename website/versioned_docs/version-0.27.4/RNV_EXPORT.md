---
id: version-0.27.4-rnv-export
title: rnv export
sidebar_label: export
original_id: rnv-export
---

<img src="https://renative.org/img/ic_cli.png" width=50 height=50 />

## Task Order

🔥 -> `configure` -> `package` -> `build` -> `export` ->  ✅

## export

Get interactive options for export

```bash
rnv export
```

### help

Display export help

```bash
rnv export help
```

## Options

`--ci` - Don't ask for confirmations

`-c`, `--appConfigID` - Switch to different appConfig beforehand

`-p`, `--platform` - Specify platform

`-s`, `--scheme` - Specify build scheme

`-r`, `--reset` - Clean project beforehand

`-i`, `--info` - Show full stack trace

`--xcodebuildArchiveArgs` - Pass down standard xcodebuild arguments (`ios`, `tvos` only)

Example:

`--xcodebuildArchiveArgs "CODE_SIGN_IDENTITY=iPhone\ Distribution\ (XXX) OTHER_CODE_SIGN_FLAGS=--keychain SOME_PATH_TO_KEYCHAIN"`

`--xcodebuildExportArgs` - Pass down custom xcodebuild arguments (`ios`, `tvos` only)

`--mono` - Monochromatic output to terminal (no colors)
