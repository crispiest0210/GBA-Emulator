# GBA Emulator

A desktop Game Boy Advance emulator dashboard built with **Tauri v2**, **Rust**, **React 19**, **TypeScript**, and **Vite**.

The app combines a native desktop shell with a browser-based emulation core, giving you a polished UI for importing ROMs, launching gameplay, managing saves, tuning controls, and packaging the project as a desktop application.

> **Status (2026-11-24): inactive, superseded.** The last commit was on 2026-07-27. This project's direction moved to [Alpha-Emulator](https://github.com/crispiest0210/Alpha-Emulator), a clean-room Rust emulator (GB/GBC/GBA/DS) whose design docs name this repo as its predecessor and reuse none of its code. See [Status & Next Steps](#status--next-steps) below.

## Overview

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Tauri v2 + Rust 2021
- **Emulation core**: Vendored `IodineGBA` running in the frontend
- **Desktop target**: Linux-first Tauri desktop app with cross-platform setup notes
- **Identifier**: `com.gba.emulator`

## Features

- **Native ROM import**
  - Pick `.gba` files with the Tauri file dialog.
  - Drag and drop ROMs directly into the window.
  - Frontend validation rejects invalid file types before import.
  - Automatically copies imported `.gba` files directly to the safe native local directory, guaranteeing persistent availability across restarts.

- **Integrated gameplay surface**
  - Renders the GBA framebuffer to a scaled in-app canvas.
  - Streams audio through the Web Audio API.
  - Loads ROM bytes from Rust into the frontend as raw byte arrays.

- **ROM library management**
  - Add ROMs via native GBA file picker or manual drag-and-drop, which are copied and preserved in the safe native local `roms/` directory.
  - Automatically auto-scans and loads all available ROMs present inside the native `roms/` folder on startup.
  - Remove ROMs from the library and delete their physical files and folders from disk.
  - Track `lastPlayedAt` when launching a ROM.

- **Save systems**
  - Cartridge save data is synchronized through frontend storage for live game saves.
  - Save checkpoints are true, frame-accurate GBA hardware snapshots (fully serializing the CPU registers, ARM/THUMB execution states, WRAM/IRAM, background renderers, sprite OAM lists, palettes, sound levels, and cartridge save-chips).
  - Save checkpoints are stored on disk under the safe native local `saves/<rom_id>/` directory as `.state` files.
  - Automatically auto-scans and lists all saves present inside the native `saves/` folder on startup.
  - Saves can be listed, loaded instantly on the exact frame, and permanently deleted from both the UI and physical disk.

- **Player controls**
  - Adjustable keybinds persisted in `localStorage`.
  - Volume and mute controls persisted in `localStorage`.
  - Fast-forward, rewind, quick save, and quick load flows are integrated into the UI.

## Default Controls

The app exposes configurable keybinds, but the default layout is:

| Keyboard key | GBA action |
| --- | --- |
| `W` `A` `S` `D` | D-pad |
| `Space` | A |
| `R` | B |
| `Tab` | Start |
| `` ` `` | Select |
| `/` | L |
| `Left Shift` | R |
| `1` | Quick save |
| `4` | Quick load |
| `P` | Fast forward |
| `O` | Rewind |

## Architecture

The project is split into a React frontend and a small Rust backend:

- `src/App.tsx`
  - Main UI and emulator orchestration.
  - Handles file picking, drag and drop, keyboard input, audio state, save actions, and Tauri command calls.

- `src/App.css`
  - Dashboard layout and emulator presentation styling.

- `src-tauri/src/lib.rs`
  - Owns in-memory ROM metadata, emulator session state, and save metadata.
  - Exposes Tauri commands for ROM and save operations.

- `src-tauri/tauri.conf.json`
  - Desktop metadata, bundle targets, and frontend build hooks.

- `public/IodineGBA/`
  - Vendored emulator core.

- `public/user_scripts/`
  - Glue code for rendering and audio integration.

## Tauri Commands

The backend exposes these commands through `tauri::generate_handler!`:

1. `get_dashboard_state`
2. `list_roms`
3. `add_rom`
4. `remove_rom`
5. `remove_save`
6. `get_emulator_state`
7. `read_rom_file`
8. `load_rom`
9. `pause_emulator`
10. `resume_emulator`
11. `stop_emulator`
12. `save_state`
13. `read_save_file`
14. `load_state`
15. `list_saves`
16. `log_message`

## Current Behavior Notes

- **Backend persistence model**
  - ROM files and save checkpoints are fully persistent, stored under the OS's native local app-data directory:
    - **Windows**: `%LOCALAPPDATA%\com.gba.emulator`
    - **macOS**: `~/Library/Application Support/com.gba.emulator`
    - **Linux**: `~/.local/share/com.gba.emulator`
  - Explicitly, manual drag-and-drop and the native GBA file picker both copy the `.gba` ROM directly into this safe local directory.
  - On startup, the Rust backend automatically scans the local `roms/` directory to load available ROMs, and scans the `saves/` directory to rebuild all available save-states.
  - Active emulator session metadata remains in-memory only.

- **ROM loading**
  - ROM metadata is derived from the copied local file path under the persistent native local library.
  - ROM bytes are returned from Rust as raw `Vec<u8>` data and consumed in the frontend.

- **Save behavior**
  - Loading a ROM sets the emulator session to `Running`.
  - Loading a save sets the session to `Paused` with the save's ROM loaded.
  - Removing a ROM also resets the session, deletes its files, and cleans up its saves directory from disk.

## Development Commands

### Prerequisites

- Node.js **20.19+ or 22.12+** (Vite 7 requirement; older 22.x prints a warning)
- npm
- Rust toolchain (`rustup`, `cargo`)
- Tauri v2 platform dependencies (WebKitGTK on Linux; see `SETUP.md`)

### Windows, macOS, and Standard Linux (Ubuntu/Debian)
```bash
npm install
npm run dev        # Tauri dev window (runs `vite` on port 1420 first)
```
For production compilation:
```bash
npm run build      # tauri build: frontend build + Rust release build + installer bundles
```

Individual pieces:
```bash
npm run build:frontend          # tsc && vite build -> dist/
npm run dev:frontend            # Vite dev server only (no Tauri APIs, so ROM/save calls fail)
cargo build --manifest-path src-tauri/Cargo.toml
cargo test  --manifest-path src-tauri/Cargo.toml
```

### RHEL / Rocky Linux (with bundled shims)
Can bootstrap and launch via the local shell scripts which configure local compatibility shims under `pkgconfig/` and `lib/`:
```bash
chmod +x setup_linux_deps.sh run.sh
./setup_linux_deps.sh
./run.sh dev
```
For production compilation:
```bash
./run.sh build
```
To clean target compilation caches:
```bash
./run.sh clean
```

Note: `lib/libwebkit2gtk-4.1.so` and `lib/libjavascriptcoregtk-4.1.so` are committed as symlinks to absolute `/usr/lib64/...-4.0.so` paths, so they only resolve on a machine with that layout.

### Verification (2026-11-24, macOS, Node 22.6.0, cargo 1.97.1)

| Command | Result |
| --- | --- |
| `npm run build:frontend` | Passes (Vite warns that Node 22.6.0 is below 22.12) |
| `cargo build` in `src-tauri/` | Passes, 0 warnings |
| `cargo test` in `src-tauri/` | Passes, but runs 0 tests |
| `npm run dev`, `npm run build` | Not re-verified in this audit (opens a GUI window / produces bundles) |
| `./run.sh *`, `./setup_linux_deps.sh` | Not verified (Linux only) |

## Setup

For full environment setup and platform notes, see:

- `SETUP.md`

## Testing Status

- No automated test suite exists. `package.json` has no `npm test` script.
- `cargo test` in `src-tauri/` compiles and reports 0 tests.
- `roms/gba-audio-test.gba` (7 KB, open-source test ROM) is committed for manual smoke testing.

## Known Constraints

- The current implementation is optimized for local desktop usage rather than headless automation.
- Emulation runs in the WebView's JavaScript (IodineGBA); Rust only handles file I/O and session metadata.
- The app fetches `public/gba_bios.bin` on startup.

## Legal / Repository Hygiene Warning

This repository is **public** on GitHub and currently tracks two files that should not be redistributed:

- `roms/Pokemon - Emerald Version (USA, Europe).gba` (16 MB): a commercial Nintendo game ROM.
- `public/gba_bios.bin` (16 KB, SHA-1 `300c20df6731a33952ded8c436f7f186d25d3492`): matches the official Nintendo GBA BIOS dump.

Removing them from the working tree is not enough, because they remain in git history. See the first next steps below.

## Status & Next Steps

**As of 2026-11-24**

- **State:** Inactive and superseded. The app builds (frontend and Rust) and, per the commit history, played games with snapshot save-states as of July 2026. Its replacement is Alpha-Emulator, a from-scratch Rust emulator that covers GBA plus GB/GBC/DS and lists this repo's features (persistent library, snapshot saves, HUD, keybinds, rewind) as product requirements it already ships.
- **Done:** IodineGBA core integrated end to end; canvas video and Web Audio; native ROM import (picker and drag-and-drop) copied to app-data; startup auto-scan of ROMs and saves; full snapshot save-states (save/load/delete); quick save/load, fast-forward, rewind; HUD keybind remapper; frontend log forwarding to the terminal.
- **Not done:** automated tests; a persisted ROM library index (the library is rebuilt by scanning on startup); diagnostics and recovery flows.
- **Last activity:** 2026-07-27 (`aed1553`, "added test roms within the repo").

### Next steps (prioritized)

- [ ] Remove the commercial ROM and the Nintendo BIOS from the repo and from git history (for example with `git filter-repo --path "roms/Pokemon - Emerald Version (USA, Europe).gba" --path public/gba_bios.bin --invert-paths`, then force-push). Rewriting history is destructive, so coordinate with the owner first.
- [ ] Narrow `.gitignore` so only the homebrew test ROM is allowed under `roms/` and add `*.bin` BIOS files to it; make BIOS loading user-supplied (document where to put it).
- [ ] Decide the repo's fate: **archive it on GitHub** with a pointer to Alpha-Emulator (recommended), or keep it as a reference. Anything still worth porting is product behavior already listed in Alpha-Emulator's `docs/successor-emulator/00-INDEX-AND-ARCHITECTURE.md`; no code is meant to move.
- [ ] If development continues instead: add Rust unit tests for `src-tauri/src/lib.rs` (ROM/save scanning, `remove_rom`/`remove_save` disk cleanup).
- [ ] If development continues: split `src/App.tsx` (about 2,200 lines) into components and hooks, and add a frontend test runner (for example Vitest) plus an `npm test` script.
- [ ] Replace the absolute-path symlinks in `lib/` with ones generated by `setup_linux_deps.sh` at setup time, or stop tracking them.
- [ ] Add a LICENSE file (TBD by the owner). The vendored IodineGBA and XAudioJS keep their own upstream licenses.
