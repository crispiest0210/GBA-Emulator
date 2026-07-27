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

## Setup and Execution Workflows

Choose the execution workflow that matches your operating system:

### Windows, macOS, and Standard Linux (Ubuntu/Debian)
Can set up, run, and compile the app using standard npm commands flawlessly:
```bash
# Install dependencies
npm install

# Run the app in development mode
npm run dev

# Compile the production app packages
npm run build
```

### RHEL / Rocky Linux (with bundled shims)
Can bootstrap, run, and compile the app via the local shell scripts. These configure the local compatibility shims under `pkgconfig/` and `lib/` and export required path environment variables seamlessly:
```bash
# Make helper scripts executable
chmod +x setup_linux_deps.sh run.sh

# Bootstrap and install dependencies
./setup_linux_deps.sh

# Run the app in desktop development mode (with hot-reloading)
./run.sh dev

# Compile and package production installer bundles
./run.sh build

# Clean cargo target compilation caches
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

- **Backend persistence model**: ROM files and save checkpoints are fully persistent across restarts, stored under the OS's native local app-data directory:
  - **Windows**: `%LOCALAPPDATA%\com.gba.emulator`
  - **macOS**: `~/Library/Application Support/com.gba.emulator`
  - **Linux**: `~/.local/share/com.gba.emulator`
- **ROM imports**: Manual drag-and-drop and the native GBA file picker both copy the `.gba` ROM directly to this safe native local folder, guaranteeing persistent local availability.
- **Saves metadata and state**: Save checkpoints are stored dynamically under the native `saves/<rom_id>/` directory as `.state` files, and automatically scanned/listed on startup.
- **Active session**: Active emulator session state (such as running/paused/loaded ROM metadata) remains in-memory only.

## Troubleshooting

### Build fails on Linux due to WebKitGTK or pkg-config

- Run `./setup_linux_deps.sh`
- Prefer `./run.sh dev` or `./run.sh build`
- Confirm the compatibility files exist under `pkgconfig/` and `lib/`

## Verified commands

- `npm install`
- `npm run dev`
- `npm run build`
- `./run.sh dev`
- `./run.sh build`
- `./run.sh clean`
