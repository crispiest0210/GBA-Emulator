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

- **Integrated gameplay surface**
  - Renders the GBA framebuffer to a scaled in-app canvas.
  - Streams audio through the Web Audio API.
  - Loads ROM bytes from Rust into the frontend as raw byte arrays.

- **ROM library management**
  - Add ROMs from local disk.
  - Remove ROMs from the in-memory library.
  - Track `lastPlayedAt` when launching a ROM.

- **Save systems**
  - Cartridge save data is synchronized through frontend storage for live game saves.
  - Save checkpoints are stored on disk under `saves/<rom_id>/` as `.state` files.
  - Saves can be listed, loaded, and rewound from the dashboard.

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
5. `get_emulator_state`
6. `read_rom_file`
7. `load_rom`
8. `pause_emulator`
9. `resume_emulator`
10. `stop_emulator`
11. `save_state`
12. `read_save_file`
13. `load_state`
14. `list_saves`

## Current Behavior Notes

- **Backend persistence model**
  - Library and emulator session metadata are in-memory only.
  - Restarting the app resets the backend state.

- **ROM loading**
  - ROM metadata is derived from the selected local file path.
  - ROM bytes are returned from Rust as raw `Vec<u8>` data and consumed in the frontend.

- **Save behavior**
  - Loading a ROM sets the emulator session to `Running`.
  - Loading a save sets the session to `Paused` with the save's ROM loaded.
  - Removing the currently loaded ROM resets the session and removes related saves.

## Development Commands

Use either the npm scripts or the helper shell script:

```bash
npm install
npm run dev
npm run build
```

```bash
./run.sh dev
./run.sh build
./run.sh clean
```

On this project, `run.sh` exports the local `PKG_CONFIG_PATH`, `LIBRARY_PATH`, and `LD_LIBRARY_PATH` values needed for the Linux compatibility shims in `pkgconfig/` and `lib/`.

## Setup

For full environment setup and platform notes, see:

- `SETUP.md`

## Testing Status

- No automated test suite is currently configured.
- `package.json` does not define an `npm test` script.
- There are no Rust test modules or integration tests under `src-tauri`.

## Known Constraints

- The backend library index is not persisted across restarts.
- Save checkpoints are persisted to disk, but ROM library metadata is not.
- The current implementation is optimized for local desktop usage rather than headless automation.

## Next Recommended Improvements

- Add automated frontend and Rust tests.
- Persist the ROM library index using SQLite or a file-backed store.
- Continue refining emulator UX, diagnostics, and recovery flows.
