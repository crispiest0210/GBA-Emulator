# GBA Emulator

A desktop Game Boy Advance emulator dashboard built with **Tauri v2**, **Rust**, **React 19**, **TypeScript**, and **Vite**.

The app combines a native desktop shell with a browser-based emulation core, giving you a polished UI for importing ROMs, launching gameplay, managing saves, tuning controls, and packaging the project as a desktop application.

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

Choose the commands based on your operating system:

### Windows, macOS, and Standard Linux (Ubuntu/Debian)
Can set up and run using standard commands:
```bash
npm install
npm run dev
```
For production compilation:
```bash
npm run build
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

## Setup

For full environment setup and platform notes, see:

- `SETUP.md`

## Testing Status

- No automated test suite is currently configured.
- `package.json` does not define an `npm test` script.
- There are no Rust test modules or integration tests under `src-tauri`.

## Known Constraints

- The current implementation is optimized for local desktop usage rather than headless automation.

## Next Recommended Improvements

- Add automated frontend and Rust tests.
- Continue refining emulator UX, diagnostics, and recovery flows.
