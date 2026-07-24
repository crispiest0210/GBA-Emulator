# Game Boy Advance Emulator Control Center

A modern, high-performance **Game Boy Advance (GBA) Emulator Dashboard** desktop application built on top of **Tauri v2**, **Rust**, **React 19**, and **TypeScript**. 

This application provides a sleek management hub for importing, launching, and managing Game Boy Advance ROM libraries and real-time cartridge save checkpoints persistently on disk.

---

## 🎮 Core Capabilities

- **Integrated Emulation Engine**: Runs a fully integrated **IodineGBA** emulation core directly inside the desktop window wrapper.
- **Pixel-Perfect Video rendering**: Frames are pushed on every VSync to a hardware-accelerated GBA 240x160 viewport using custom graphics blitting.
- **Full Stereo Audio**: Game sound is mixed and played in real-time through the Web Audio API.
- **Intelligent File Picker & Drag-and-Drop**: Easily import ROMs via native file dialogs or by dragging a `.gba` file directly into the application window.
- **Persistent Saved Game Checkpoints**:
  - **In-Game Cartridge Saves**: Standard diary saves (such as saving inside a Pokémon game menu) are persistently saved to browser local storage.
  - **Custom State Checkpoints**: Capture and restore the live running VM cartridge memory state as separate disk-backed checkpoint files under `saves/<rom_id>/` at any point!

---

## 🕹️ Keyboard Controls

During gameplay, the emulator coordinates the following desktop keyboard mappings to the original GBA buttons:

| Keyboard Key | GBA Controller Button |
|---|---|
| **Arrow Keys** (↑ ↓ ← →) | Directional D-Pad |
| **X** | **A** Button |
| **Z** | **B** Button |
| **Enter** | **Start** |
| **Shift** | **Select** |
| **A** | **L** Trigger |
| **S** | **R** Trigger |

---

## 📦 Project Structure

The project divides its workloads into a secure Rust backend shell and a sandboxed high-performance React frontend:

- `src/App.tsx` — Main React dashboard interface, managing canvas frame rendering, game controls, and keyboard dispatching.
- `src/App.css` — Modern dark dashboard styling.
- `src-tauri/src/lib.rs` — Rust application backend, storing in-memory ROM/Save indexes, reading files from disk, and streaming bytes to the frontend.
- `src-tauri/tauri.conf.json` — Tauri native build configurations and system permission capabilities.
- `public/IodineGBA/` — Vendored IodineGBA emulator core source modules.
- `public/user_scripts/` — Audio and canvas blitting bridges.

---

## 🛠️ Installation and Setup

For step-by-step instructions on setting up compilers, system developer dependencies, and running/compiling the application for **Windows**, **macOS**, and **Linux**, please refer to:

👉 **[SETUP.md](./SETUP.md)**

---

## 🔬 How the Backend Behaves

The Rust backend in `src-tauri/src/lib.rs` maintains the collection of ROM metadata, active emulator sessions, and save state records:
- **Streaming**: ROMs are loaded dynamically by streaming their binary bytes from your local disk into the frontend on demand.
- **Integrity**: Deleting a loaded ROM automatically resets the emulator state and removes its associated state checkpoints on disk to maintain metadata integrity.
- **Disk Persistence**: Checkpoints are backed up as raw binary files (`.state`) on your local drive, making them persistent across computer reboots.

