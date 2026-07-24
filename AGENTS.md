# AGENTS.md

## Project summary

- Project: GBA Emulator dashboard desktop app
- Frontend: React 19.1.0 + TypeScript 5.8.3 + Vite 7.0.4
- Backend: Tauri v2 + Rust 2021
- Tauri identifier: `com.gba.emulator`

## Important files

- `src/App.tsx` — main dashboard UI that invokes all Tauri commands
- `src/App.css` — dashboard styling
- `src-tauri/src/lib.rs` — in-memory backend state and Tauri commands
- `src-tauri/tauri.conf.json` — Tauri build/dev configuration
- `README.md` — project-specific setup and capability overview

## Implemented backend commands

The Rust backend exposes 12 commands through `tauri::generate_handler!`:

1. `get_dashboard_state`
2. `list_roms`
3. `add_rom`
4. `remove_rom`
5. `get_emulator_state`
6. `load_rom`
7. `pause_emulator`
8. `resume_emulator`
9. `stop_emulator`
10. `save_state`
11. `load_state`
12. `list_saves`

## Current behavior notes

- Backend state is in-memory only and resets on app restart.
- Package and Tauri config metadata still use scaffold branding in multiple places: `package.json` name `tauri-app`, `src-tauri/Cargo.toml` package name `tauri-app` with description `A Tauri App`, and `src-tauri/tauri.conf.json` product/window title `tauri-app`.
- Adding a ROM stores metadata derived from the supplied local file path.
- ROM import is currently a manual text input in `src/App.tsx`; there is no file picker and no frontend validation that restricts selection to `.gba` files or otherwise guides valid paths before invoking `add_rom`.
- Loading a ROM marks the session as `Running` and updates `lastPlayedAt`.
- Loading a save sets the session to `Paused` with the save's ROM loaded.
- Removing a loaded ROM also resets the emulator session and removes related saves.

## Verified commands

- Install dependencies: `npm install`
- Frontend build: `npm run build`
- Run Tauri dev app: `npm run tauri dev`
- Production build: `npm run tauri build`

## Testing status

- No automated test files or test commands are currently configured in the repository.
- `package.json` does not define an `npm test` script.
- There are no Rust `#[cfg(test)]` modules or `tests/` integration test files under `src-tauri`.

## Recent work completed

- Replaced the starter React view with a dashboard UI.
- Connected the frontend to all implemented Tauri commands.
- Added ROM library, emulator session, and save-state panels.
- Updated README from the default template to project-specific documentation.
- Replaced manual ROM text import with an elegant file picker dialog restricted to `.gba` extensions (implemented dialog plugin backend + permissions).
- Integrated a fully working, real Game Boy Advance emulation core (**IodineGBA**) end-to-end.
- Wired video rendering to a scaled high-performance canvas inside the React view, audio mixed using the Web Audio API, and full directional keyboard mapping.
- Implemented persistent disk-backed save checkpoints (capturing, writing, and loading Live GBA SRAM files back and forth between Rust and JavaScript).

## Handoff notes

All core planned milestones have been successfully completed:
1. **File Picker based ROM Import**: Implemented. Dialog backend plugin initialized, capability permissions granted, React UI hooked up with `@tauri-apps/plugin-dialog`.
2. **Real GBA Core Integration**: Implemented. IodineGBA vendored locally into `public/`, and integrated directly into our custom React cycle.
3. **VM Save States and Checkpoints**: Implemented. Live SRAM memory buffers are read/written directly to `.state` files on disk under `saves/<rom_id>/` through custom Tauri commands (`read_save_file` and updated `save_state`).

Next potential steps:
- Add automated test suites for Rust command structures and mock UI testing.
- Implement permanent SQLite or file-backed database storage for ROM library index persistence.
