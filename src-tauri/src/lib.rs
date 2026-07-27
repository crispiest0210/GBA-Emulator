// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use std::{
    fs,
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RomMetadata {
    id: String,
    title: String,
    file_name: String,
    file_path: String,
    size_bytes: u64,
    favorite: bool,
    last_played_at: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
enum EmulatorStatus {
    Stopped,
    Running,
    Paused,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmulatorSession {
    status: EmulatorStatus,
    loaded_rom_id: Option<String>,
    loaded_rom_title: Option<String>,
    fps_target: u16,
    audio_enabled: bool,
    fast_forward: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
enum SaveKind {
    SaveState,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveEntry {
    id: String,
    rom_id: String,
    rom_title: String,
    label: String,
    kind: SaveKind,
    file_path: String,
    created_at: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardState {
    roms: Vec<RomMetadata>,
    emulator: EmulatorSession,
    saves: Vec<SaveEntry>,
}

struct BackendState {
    roms: Vec<RomMetadata>,
    emulator: EmulatorSession,
    saves: Vec<SaveEntry>,
    next_rom_id: u64,
    next_save_id: u64,
}

struct AppState {
    backend: Mutex<BackendState>,
}

impl Default for AppState {
    fn default() -> Self {
        let mut backend = BackendState {
            roms: Vec::new(),
            emulator: EmulatorSession {
                status: EmulatorStatus::Stopped,
                loaded_rom_id: None,
                loaded_rom_title: None,
                fps_target: 60,
                audio_enabled: true,
                fast_forward: false,
            },
            saves: Vec::new(),
            next_rom_id: 1,
            next_save_id: 1,
        };

        scan_library(&mut backend);

        Self {
            backend: Mutex::new(backend),
        }
    }
}

impl BackendState {
    fn snapshot(&self) -> DashboardState {
        DashboardState {
            roms: self.roms.clone(),
            emulator: self.emulator.clone(),
            saves: self.saves.clone(),
        }
    }

    fn rom_title_for(&self, rom_id: &str) -> Option<String> {
        self.roms
            .iter()
            .find(|rom| rom.id == rom_id)
            .map(|rom| rom.title.clone())
    }
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn derive_rom_title(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Unknown ROM")
        .replace(['_', '-'], " ")
}

fn derive_file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("unknown.gba")
        .to_string()
}

fn scan_library(backend: &mut BackendState) {
    // 1. Ensure "roms" directory exists
    let roms_dir = Path::new("roms");
    if !roms_dir.exists() {
        let _ = fs::create_dir_all(roms_dir);
    }

    // 2. Scan "roms" directory
    if let Ok(entries) = fs::read_dir(roms_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("gba")) {
                if let Some(file_path_str) = path.to_str() {
                    // Check if already in list
                    if !backend.roms.iter().any(|rom| rom.file_path == file_path_str) {
                        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let rom_id = format!("rom-{}", backend.next_rom_id);
                        let title = derive_rom_title(file_path_str);
                        let file_name = derive_file_name(file_path_str);
                        
                        backend.roms.push(RomMetadata {
                            id: rom_id,
                            title,
                            file_name,
                            file_path: file_path_str.to_string(),
                            size_bytes,
                            favorite: false,
                            last_played_at: None,
                        });
                        backend.next_rom_id += 1;
                    }
                }
            }
        }
    }

    // 3. Ensure "saves" directory exists
    let saves_dir = Path::new("saves");
    if !saves_dir.exists() {
        let _ = fs::create_dir_all(saves_dir);
    }

    // 4. Scan "saves" directory
    if let Ok(rom_dirs) = fs::read_dir(saves_dir) {
        for rom_dir_entry in rom_dirs.flatten() {
            let rom_dir_path = rom_dir_entry.path();
            if rom_dir_path.is_dir() {
                if let Some(rom_id) = rom_dir_path.file_name().and_then(|name| name.to_str()) {
                    // This is a ROM ID directory!
                    if let Ok(save_entries) = fs::read_dir(&rom_dir_path) {
                        for save_entry in save_entries.flatten() {
                            let save_path = save_entry.path();
                            if save_path.is_file() && save_path.extension().map_or(false, |ext| ext == "state") {
                                if let Some(save_file_name) = save_path.file_name().and_then(|name| name.to_str()) {
                                    let save_id = save_path
                                        .file_stem()
                                        .and_then(|stem| stem.to_str())
                                        .unwrap_or(save_file_name)
                                        .to_string();
                                    
                                    let file_path = save_path.to_string_lossy().to_string();
                                    
                                    // Parse next_save_id if it's "save-X"
                                    if save_id.starts_with("save-") {
                                        if let Ok(num) = save_id["save-".len()..].parse::<u64>() {
                                            if num >= backend.next_save_id {
                                                backend.next_save_id = num + 1;
                                            }
                                        }
                                    }

                                    let rom_title = backend
                                        .rom_title_for(rom_id)
                                        .unwrap_or_else(|| "Unknown ROM".to_string());

                                    let created_at = save_entry
                                        .metadata()
                                        .and_then(|m| m.modified())
                                        .map(|t| {
                                            t.duration_since(UNIX_EPOCH)
                                                .map(|d| d.as_secs())
                                                .unwrap_or_else(|_| current_timestamp())
                                        })
                                        .unwrap_or_else(|_| current_timestamp());

                                    // Avoid duplicates
                                    if !backend.saves.iter().any(|s| s.id == save_id) {
                                        backend.saves.push(SaveEntry {
                                            id: save_id,
                                            rom_id: rom_id.to_string(),
                                            rom_title,
                                            label: format!("Save Point ({})", rom_id),
                                            kind: SaveKind::SaveState,
                                            file_path,
                                            created_at,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn is_supported_rom_file(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("gba"))
        .unwrap_or(false)
}

#[tauri::command]
fn get_dashboard_state(state: State<'_, AppState>) -> Result<DashboardState, String> {
    let backend = state.backend.lock().map_err(|err| err.to_string())?;
    Ok(backend.snapshot())
}

#[tauri::command]
fn list_roms(state: State<'_, AppState>) -> Result<Vec<RomMetadata>, String> {
    let backend = state.backend.lock().map_err(|err| err.to_string())?;
    Ok(backend.roms.clone())
}

#[tauri::command]
fn add_rom(file_path: String, state: State<'_, AppState>) -> Result<RomMetadata, String> {
    let mut backend = state.backend.lock().map_err(|err| err.to_string())?;

    if file_path.trim().is_empty() {
        return Err("ROM path cannot be empty".to_string());
    }

    if !is_supported_rom_file(&file_path) {
        return Err("Only .gba ROM files are supported".to_string());
    }

    let metadata = fs::metadata(&file_path).map_err(|_| "ROM file could not be found".to_string())?;

    if !metadata.is_file() {
        return Err("ROM path must point to a file".to_string());
    }

    // Ensure local "roms" directory exists
    let roms_dir = Path::new("roms");
    if !roms_dir.exists() {
        fs::create_dir_all(roms_dir).map_err(|e| format!("Failed to create roms library folder: {}", e))?;
    }

    // Copy to "roms" folder
    let file_name = derive_file_name(&file_path);
    let dest_path = roms_dir.join(&file_name);
    
    if fs::canonicalize(&file_path).ok() != fs::canonicalize(&dest_path).ok() {
        fs::copy(&file_path, &dest_path).map_err(|e| format!("Failed to copy ROM to library: {}", e))?;
    }

    let dest_path_str = dest_path.to_string_lossy().to_string();

    if backend.roms.iter().any(|rom| rom.file_path == dest_path_str) {
        return Err("ROM already exists in the library".to_string());
    }

    let rom = RomMetadata {
        id: format!("rom-{}", backend.next_rom_id),
        title: derive_rom_title(&dest_path_str),
        file_name: derive_file_name(&dest_path_str),
        size_bytes: metadata.len(),
        file_path: dest_path_str,
        favorite: false,
        last_played_at: None,
    };

    backend.next_rom_id += 1;
    backend.roms.push(rom.clone());

    Ok(rom)
}

#[tauri::command]
fn remove_rom(rom_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut backend = state.backend.lock().map_err(|err| err.to_string())?;
    
    // Find ROM to delete its file from disk
    if let Some(rom) = backend.roms.iter().find(|rom| rom.id == rom_id) {
        if Path::new(&rom.file_path).exists() {
            let _ = fs::remove_file(&rom.file_path);
        }
    }

    let initial_count = backend.roms.len();
    backend.roms.retain(|rom| rom.id != rom_id);

    if backend.roms.len() == initial_count {
        return Err("ROM not found".to_string());
    }

    // Delete saves directory from disk
    let rom_saves_dir = Path::new("saves").join(&rom_id);
    if rom_saves_dir.exists() {
        let _ = fs::remove_dir_all(rom_saves_dir);
    }

    backend.saves.retain(|save| save.rom_id != rom_id);

    if backend.emulator.loaded_rom_id.as_deref() == Some(rom_id.as_str()) {
        backend.emulator = EmulatorSession {
            status: EmulatorStatus::Stopped,
            loaded_rom_id: None,
            loaded_rom_title: None,
            fps_target: 60,
            audio_enabled: true,
            fast_forward: false,
        };
    }

    Ok(())
}

#[tauri::command]
fn remove_save(save_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut backend = state.backend.lock().map_err(|err| err.to_string())?;

    let index = backend
        .saves
        .iter()
        .position(|save| save.id == save_id)
        .ok_or_else(|| "Save state not found".to_string())?;

    let save = &backend.saves[index];

    // Delete file from disk
    if Path::new(&save.file_path).exists() {
        fs::remove_file(&save.file_path).map_err(|e| format!("Failed to delete save file: {}", e))?;
    }

    // Remove from in-memory array
    backend.saves.remove(index);

    Ok(())
}

#[tauri::command]
fn get_emulator_state(state: State<'_, AppState>) -> Result<EmulatorSession, String> {
    let backend = state.backend.lock().map_err(|err| err.to_string())?;
    Ok(backend.emulator.clone())
}

#[tauri::command]
fn read_rom_file(rom_id: String, state: State<'_, AppState>) -> Result<Vec<u8>, String> {
    let backend = state.backend.lock().map_err(|err| err.to_string())?;
    let rom = backend
        .roms
        .iter()
        .find(|rom| rom.id == rom_id)
        .ok_or_else(|| "ROM not found".to_string())?;

    fs::read(&rom.file_path).map_err(|err| format!("Failed to read ROM file: {}", err))
}

#[tauri::command]
fn load_rom(rom_id: String, state: State<'_, AppState>) -> Result<EmulatorSession, String> {
    let mut backend = state.backend.lock().map_err(|err| err.to_string())?;
    let rom_index = backend
        .roms
        .iter()
        .position(|rom| rom.id == rom_id)
        .ok_or_else(|| "ROM not found".to_string())?;

    let rom = &mut backend.roms[rom_index];
    rom.last_played_at = Some(current_timestamp());

    backend.emulator = EmulatorSession {
        status: EmulatorStatus::Running,
        loaded_rom_id: Some(rom.id.clone()),
        loaded_rom_title: Some(rom.title.clone()),
        fps_target: 60,
        audio_enabled: true,
        fast_forward: false,
    };

    Ok(backend.emulator.clone())
}

#[tauri::command]
fn pause_emulator(state: State<'_, AppState>) -> Result<EmulatorSession, String> {
    let mut backend = state.backend.lock().map_err(|err| err.to_string())?;

    if !matches!(backend.emulator.status, EmulatorStatus::Running) {
        return Err("Emulator is not running".to_string());
    }

    backend.emulator.status = EmulatorStatus::Paused;
    Ok(backend.emulator.clone())
}

#[tauri::command]
fn resume_emulator(state: State<'_, AppState>) -> Result<EmulatorSession, String> {
    let mut backend = state.backend.lock().map_err(|err| err.to_string())?;

    if !matches!(backend.emulator.status, EmulatorStatus::Paused) {
        return Err("Emulator is not paused".to_string());
    }

    backend.emulator.status = EmulatorStatus::Running;
    Ok(backend.emulator.clone())
}

#[tauri::command]
fn stop_emulator(state: State<'_, AppState>) -> Result<EmulatorSession, String> {
    let mut backend = state.backend.lock().map_err(|err| err.to_string())?;

    backend.emulator.status = EmulatorStatus::Stopped;
    backend.emulator.loaded_rom_id = None;
    backend.emulator.loaded_rom_title = None;

    Ok(backend.emulator.clone())
}

#[tauri::command]
fn save_state(label: Option<String>, save_data: Vec<u8>, state: State<'_, AppState>) -> Result<SaveEntry, String> {
    let mut backend = state.backend.lock().map_err(|err| err.to_string())?;
    let rom_id = backend
        .emulator
        .loaded_rom_id
        .clone()
        .ok_or_else(|| "Load a ROM before creating a save state".to_string())?;
    let rom_title = backend
        .rom_title_for(&rom_id)
        .ok_or_else(|| "Loaded ROM no longer exists in the library".to_string())?;

    let save_id = format!("save-{}", backend.next_save_id);
    let save = SaveEntry {
        id: save_id.clone(),
        rom_id: rom_id.clone(),
        rom_title,
        label: label.unwrap_or_else(|| format!("Quick Save {}", backend.next_save_id)),
        kind: SaveKind::SaveState,
        file_path: format!("saves/{rom_id}/{save_id}.state"),
        created_at: current_timestamp(),
    };

    if let Some(parent) = Path::new(&save.file_path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create saves directory: {}", e))?;
    }
    fs::write(&save.file_path, &save_data).map_err(|e| format!("Failed to write save file: {}", e))?;

    backend.next_save_id += 1;
    backend.saves.push(save.clone());

    Ok(save)
}

#[tauri::command]
fn read_save_file(save_id: String, state: State<'_, AppState>) -> Result<Vec<u8>, String> {
    let backend = state.backend.lock().map_err(|err| err.to_string())?;
    let save = backend
        .saves
        .iter()
        .find(|entry| entry.id == save_id)
        .ok_or_else(|| "Save state not found".to_string())?;

    fs::read(&save.file_path).map_err(|err| format!("Failed to read save file: {}", err))
}

#[tauri::command]
fn load_state(save_id: String, state: State<'_, AppState>) -> Result<EmulatorSession, String> {
    let mut backend = state.backend.lock().map_err(|err| err.to_string())?;
    let save = backend
        .saves
        .iter()
        .find(|entry| entry.id == save_id)
        .cloned()
        .ok_or_else(|| "Save state not found".to_string())?;

    if !backend.roms.iter().any(|rom| rom.id == save.rom_id) {
        return Err("Save state references a ROM that no longer exists in the library".to_string());
    }

    backend.emulator = EmulatorSession {
        status: EmulatorStatus::Running,
        loaded_rom_id: Some(save.rom_id),
        loaded_rom_title: Some(save.rom_title),
        fps_target: 60,
        audio_enabled: true,
        fast_forward: false,
    };

    Ok(backend.emulator.clone())
}

#[tauri::command]
fn list_saves(rom_id: Option<String>, state: State<'_, AppState>) -> Result<Vec<SaveEntry>, String> {
    let backend = state.backend.lock().map_err(|err| err.to_string())?;
    let saves = match rom_id {
        Some(rom_id) => backend
            .saves
            .iter()
            .filter(|save| save.rom_id == rom_id)
            .cloned()
            .collect(),
        None => backend.saves.clone(),
    };

    Ok(saves)
}

#[tauri::command]
fn log_message(level: String, message: String) {
    println!("[JS {}] {}", level, message);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_dashboard_state,
            list_roms,
            add_rom,
            remove_rom,
            remove_save,
            get_emulator_state,
            read_rom_file,
            load_rom,
            pause_emulator,
            resume_emulator,
            stop_emulator,
            save_state,
            read_save_file,
            load_state,
            list_saves,
            log_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
