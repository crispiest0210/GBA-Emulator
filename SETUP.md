# SETUP

This guide documents the current development setup for the GBA Emulator desktop app.

## Stack

- **Frontend**: React 19, TypeScript 5, Vite 7
- **Backend**: Tauri v2, Rust 2021
- **Desktop runtime**: WebKitGTK on Linux

## Prerequisites

Install these before running the app:

- **Node.js**
  - Recommended: current active LTS release compatible with Vite 7 and Tauri v2

- **npm**
  - Bundled with Node.js

- **Rust toolchain**
  - Install with `rustup`
  - Ensure `cargo` and `rustc` are available in your shell

## Repository bootstrap

```bash
npm install
```

## Running the app

You can use either npm directly or the provided helper script.

### Option 1: helper script

```bash
./run.sh dev
```

### Option 2: npm script

```bash
npm run dev
```

## Building the app

### Development build flow

```bash
npm run build
```

Or:

```bash
./run.sh build
```

## Cleaning Rust build artifacts

```bash
./run.sh clean
```

## Linux notes

This repository includes Linux compatibility shims under:

- `pkgconfig/`
- `lib/`

The helper script exports:

- `PKG_CONFIG_PATH`
- `LIBRARY_PATH`
- `LD_LIBRARY_PATH`

That makes `./run.sh dev` and `./run.sh build` the safest entry points on Linux.

## Installing Linux dependencies

The repository includes `setup_linux_deps.sh` for Debian/Ubuntu and Rocky/RHEL/Fedora-like systems.

Run it with:

```bash
./setup_linux_deps.sh
```

### Debian/Ubuntu path

The script installs:

- `libwebkit2gtk-4.1-dev`
- `build-essential`
- `curl`
- `wget`
- `file`
- `libxdo-dev`
- `libssl-dev`
- `libayatana-appindicator3-dev`
- `librsvg2-dev`

### Rocky/RHEL/Fedora path

The script:

- Enables CRB when available
- Installs EPEL
- Installs development tools
- Installs WebKitGTK, GTK, GLib, OpenSSL, and pkg-config dependencies
- Generates local `.pc` compatibility files in `pkgconfig/`
- Generates local compatibility libraries in `lib/`

This setup exists because some Linux environments do not ship the exact library names Tauri expects.

## Manual Linux fallback

If you do not use `run.sh`, export the local paths manually before running the app:

```bash
PKG_CONFIG_PATH="$PWD/pkgconfig:$PKG_CONFIG_PATH" LIBRARY_PATH="$PWD/lib:$LIBRARY_PATH" LD_LIBRARY_PATH="$PWD/lib:$LD_LIBRARY_PATH" npm run dev
```

For builds:

```bash
PKG_CONFIG_PATH="$PWD/pkgconfig:$PKG_CONFIG_PATH" LIBRARY_PATH="$PWD/lib:$LIBRARY_PATH" LD_LIBRARY_PATH="$PWD/lib:$LD_LIBRARY_PATH" npm run build
```

## Important runtime behavior

- ROM library metadata is stored in memory only.
- Save checkpoints are written to disk under `saves/<rom_id>/`.
- The app expects local `.gba` files for ROM import.

## Troubleshooting

### Build fails on Linux due to WebKitGTK or pkg-config

- Run `./setup_linux_deps.sh`
- Prefer `./run.sh dev` or `./run.sh build`
- Confirm the compatibility files exist under `pkgconfig/` and `lib/`

### App launches but library is empty after restart

This is expected with the current architecture. Backend ROM metadata is not persisted yet.

### Save files exist but ROM list reset

Also expected. Save checkpoint files are disk-backed, but the ROM library index is still in-memory only.

## Verified commands

- `npm install`
- `npm run dev`
- `npm run build`
- `./run.sh dev`
- `./run.sh build`
- `./run.sh clean`
