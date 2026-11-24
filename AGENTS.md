# AGENTS.md

## Project summary

- Project: GBA Emulator dashboard desktop app
- Frontend: React 19.1.0 + TypeScript 5.8.3 + Vite 7.0.4
- Backend: Tauri v2 + Rust 2021
- Tauri identifier: `com.gba.emulator`
- Status (2026-11-24): inactive since 2026-07-27 and superseded by the Alpha-Emulator repo (clean-room Rust rewrite). See README "Status & Next Steps".

## Important files

- `src/App.tsx` — main dashboard UI that invokes emulator flows and all Tauri commands
- `src/App.css` — dashboard styling and emulator layout
- `src-tauri/src/lib.rs` — in-memory backend state and Tauri commands
- `src-tauri/tauri.conf.json` — Tauri build/dev configuration
- `README.md` — project overview, features, commands, and architecture
- `SETUP.md` — environment setup, Linux dependency notes, and troubleshooting
- `run.sh` — helper script for dev, build, and clean flows with Linux env exports
- `setup_linux_deps.sh` — Linux dependency bootstrapper and compatibility shim generator

## Implemented backend commands

The Rust backend exposes 16 commands through `tauri::generate_handler!`:

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

## Current behavior notes

- ROM files and save checkpoints persist under the OS app-data dir for `com.gba.emulator`; the ROM and save lists are rebuilt by scanning `roms/` and `saves/` on startup. Emulator session state is in-memory only.
- Branding is now aligned with the project name in the active Tauri metadata and Rust package metadata.
- Adding a ROM copies the `.gba` file into the app-data `roms/` folder and derives metadata from the copied path.
- ROM import supports the Tauri dialog file picker and drag-and-drop `.gba` files.
- Loading a ROM marks the session as `Running` and updates `lastPlayedAt`.
- Loading a save sets the session to `Paused` with the save's ROM loaded.
- Removing a loaded ROM also resets the emulator session and removes related saves.
- Save checkpoint files are written to disk under `saves/<rom_id>/`.
- Frontend keybind, volume, and mute preferences are persisted in `localStorage`.

## Verified commands

Re-checked 2026-11-24 on macOS (Node 22.6.0, cargo 1.97.1):

- `npm run build:frontend`: passes (Vite wants Node 20.19+ or 22.12+ and warns otherwise)
- `cargo build` / `cargo test` in `src-tauri/`: pass, 0 warnings, 0 tests

Listed previously but not re-verified in that audit:

- Install dependencies: `npm install`
- Run Tauri dev app: `npm run dev`
- Production build: `npm run build`
- Helper dev flow: `./run.sh dev`
- Helper production build: `./run.sh build`
- Helper cleanup: `./run.sh clean`
- Linux dependency bootstrap: `./setup_linux_deps.sh`

## Testing status

- No automated test files or test commands are currently configured in the repository.
- `package.json` does not define an `npm test` script.
- There are no Rust `#[cfg(test)]` modules or `tests/` integration test files under `src-tauri`.

## Recent work completed

- Replaced the starter React view with a dashboard UI.
- Connected the frontend to all implemented Tauri commands.
- Added ROM library, emulator session, and save-state panels.
- Updated documentation from the default template to project-specific docs.
- Replaced manual ROM import with a native file picker restricted to `.gba` files.
- Added drag-and-drop ROM import support.
- Integrated a working `IodineGBA` core end-to-end.
- Wired video rendering to a scaled canvas and mixed audio through the Web Audio API.
- Implemented persistent disk-backed save checkpoints.
- Optimized ROM loading by returning raw bytes from Rust instead of Base64 payloads.
- Added the root `run.sh` helper for Linux-friendly dev/build flows.
- Patched keyboard event listeners to intercept emulator control keys during the bubbling phase, preventing legacy dual-handler event hijacking.
- Implemented robust synchronous authentic BIOS loading by pre-fetching `gba_bios.bin` on app mount, eliminating a critical async timing-race condition that crashed the GBA CPU and caused black screens on reload.
- Guaranteed full emulator core (`IOCore`) initialization prior to save state imports inside `syncSession()`, preventing unhandled TypeErrors that halted the emulator play thread.
- Implemented automatic CPU warm-reboot (`iodine.restart()`) after any save-state load or quickload operation, forcing GBA games to cleanly detect and load cartridge saves from boot and title screens.
- Standardized and loosened hotkey status checks to allow quicksaving and quickloading in both `"running"` and `"paused"` states.
- Untangled GBA SELECT key from HUD menu toggling: HUD menu is now strictly toggled via `Escape` key, allowing GBA SELECT (tilde key) to be passed normally to the emulator to let players save and interact with in-game menus.
- Integrated an in-game HUD Keybind Configurer overlay allowing players to seamlessly view, customize, and reset GBA keyboard controls on-the-fly while playing.
- Added a `log_message` Tauri command bridge to automatically forward all frontend JavaScript console logs, warnings, and unhandled errors straight to the desktop terminal for real-time debugging.
- Added `**/saves/**` to the watch ignore list in `vite.config.ts` to prevent Vite from triggering full browser reloads during gameplay save-states.
- Fixed all TypeScript compilation warnings and errors including unused methods and type casting on timestamps.
- Designed and implemented true snapshot-based save state serialization (`exportGbaState` / `importGbaState`) (originally on a `save-state-debugging` branch, now merged into `main`), capturing the full CPU, memory (WRAM/IRAM), GfxState, timers, DMAs, and cartridge-chip registers.
- Resolved quickload visual corruption (scrambled/corrupted tile visuals on reload) by deeply serializing all background controllers (text, affine, matrices), color effects, and windows, and rebuilding the graphics/sprite lookup caches by feeding Palette and OAM RAM byte-by-byte into their core parsing write functions on load.
- Designed and implemented a self-bootstrapping, persistent local GBA library: on startup, the Rust backend automatically scans the local `roms/` directory to load available ROMs, and scans the `saves/` directory to rebuild all available save-states.
- Configured ROM import to automatically copy `.gba` ROMs directly into the local `roms/` folder upon drag-and-drop or picker import, guaranteeing persistent local availability across restarts.
- Implemented robust, disk-backed save-state deletion capability (`remove_save`), allowing players to permanently delete checkpoints both in the dashboard UI and from their physical disk space.
- Downloaded and configured the open-source `gba-audio-test.gba` test ROM for diagnostic bios-free emulator smoke testing.

## Handoff notes

Current architecture highlights:

1. **Emulation Core**
   - `IodineGBA` is vendored locally under `public/` and orchestrated from `src/App.tsx`.

2. **ROM Loading Path**
   - Rust reads local ROM files and returns raw `Vec<u8>` data through `read_rom_file`.
   - The frontend consumes those bytes directly for emulator startup.

3. **Persistence Model**
   - ROM files and save checkpoints persist to disk and are re-scanned on startup.
   - There is no persisted library index; emulator session metadata is in-memory only.

4. **Linux Compatibility Strategy**
   - The repository includes local `pkgconfig/` and `lib/` compatibility shims.
   - `run.sh` is the preferred Linux entry point because it exports the required env vars automatically.

## Repository hygiene warning

- The public repo tracks a commercial ROM (`roms/Pokemon - Emerald Version (USA, Europe).gba`, 16 MB) and `public/gba_bios.bin`, which matches the official Nintendo BIOS SHA-1. Do not add more ROMs or BIOS files; see README next steps for removal.

## Next potential steps

- See README "Status & Next Steps" for the prioritized list. Older notes:

- Add automated test suites for Rust command structures and UI behavior.
- Implement permanent SQLite or file-backed storage for the ROM library index.
- Improve save recovery, diagnostics, and emulator lifecycle robustness.
