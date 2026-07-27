import { type FormEvent, useEffect, useMemo, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

type EmulatorStatus = "stopped" | "running" | "paused";
type SaveKind = "SaveState";

type RomMetadata = {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  favorite: boolean;
  lastPlayedAt: number | null;
};

type EmulatorSession = {
  status: EmulatorStatus;
  loadedRomId: string | null;
  loadedRomTitle: string | null;
  fpsTarget: number;
  audioEnabled: boolean;
  fastForward: boolean;
};

type SaveEntry = {
  id: string;
  romId: string;
  romTitle: string;
  label: string;
  kind: SaveKind;
  filePath: string;
  createdAt: number;
};

type DashboardState = {
  roms: RomMetadata[];
  emulator: EmulatorSession;
  saves: SaveEntry[];
};

type FlashMessage = {
  tone: "success" | "error";
  text: string;
};

declare global {
  interface Window {
    IodineGUI: any;
    GameBoyAdvanceEmulator: any;
    GfxGlueCode: any;
    GlueCodeMixer: any;
    GlueCodeMixerInput: any;
    base64ToArray: any;
    arrayToBase64: any;
    XAudioJSWebAudioContextHandle: any;
    XAudioJSVolume: any;
  }
}

type Keybinds = {
  up: string;
  down: string;
  left: string;
  right: string;
  start: string;
  select: string;
  a: string;
  b: string;
  l: string;
  r: string;
  quickSave: string;
  quickLoad: string;
  fastForward: string;
  rewind: string;
};

const DEFAULT_KEYBINDS: Keybinds = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  start: "Tab",
  select: "Backquote",
  a: "Space",
  b: "KeyR",
  l: "Slash",
  r: "ShiftLeft",
  quickSave: "Digit1",
  quickLoad: "Digit4",
  fastForward: "KeyP",
  rewind: "KeyO",
};

const KEY_LABELS: Record<keyof Keybinds, string> = {
  up: "D-PAD UP",
  down: "D-PAD DOWN",
  left: "D-PAD LEFT",
  right: "D-PAD RIGHT",
  start: "START",
  select: "SELECT (~) ",
  a: "BUTTON A",
  b: "BUTTON B",
  l: "BUTTON L",
  r: "BUTTON R",
  quickSave: "QUICK SAVE",
  quickLoad: "QUICK LOAD",
  fastForward: "FAST FORWARD",
  rewind: "REWIND"
};

const initialEmulator: EmulatorSession = {
  status: "stopped",
  loadedRomId: null,
  loadedRomTitle: null,
  fpsTarget: 60,
  audioEnabled: true,
  fastForward: false,
};

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return "Never";
  }

  return new Date(timestamp * 1000).toLocaleString();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [roms, setRoms] = useState<RomMetadata[]>([]);
  const [saves, setSaves] = useState<SaveEntry[]>([]);
  const [emulator, setEmulator] = useState<EmulatorSession>(initialEmulator);
  const [saveLabel, setSaveLabel] = useState("");
  const [saveFilter, setSaveFilter] = useState<string>("all");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const [showEmuMenu, setShowEmuMenu] = useState(false);
  const [hudActiveTab, setHudActiveTab] = useState<"menu" | "controls">("menu");
  const [iodineInstance, setIodineInstance] = useState<any>(null);
  
  // Custom Controls and Audio Settings
  const [keybinds, setKeybinds] = useState<Keybinds>(() => {
    const saved = localStorage.getItem("gba_keybinds");
    return saved ? JSON.parse(saved) : DEFAULT_KEYBINDS;
  });
  const [bindingAction, setBindingAction] = useState<keyof Keybinds | null>(null);
  const [emuFastForward, setEmuFastForward] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem("gba_volume");
    return saved ? Number(saved) : 50;
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem("gba_muted");
    return saved === "true";
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iodineRef = useRef<any>(null);
  const isPlayingRef = useRef<boolean>(false);
  const timerIdRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());
  const activeRomIdRef = useRef<string | null>(null);
  const pendingSaveStateRef = useRef<{ bytes: Uint8Array; romId: string } | null>(null);
  const biosBytesRef = useRef<Uint8Array | null>(null);

  const activeRom = useMemo(
    () => roms.find((rom) => rom.id === emulator.loadedRomId) ?? null,
    [emulator.loadedRomId, roms],
  );

  const totalStorage = useMemo(
    () => roms.reduce((sum, rom) => sum + rom.sizeBytes, 0),
    [roms],
  );

  const visibleSaves = useMemo(
    () => (saveFilter === "all" ? saves : saves.filter((save) => save.romId === saveFilter)),
    [saveFilter, saves],
  );

  useEffect(() => {
    if (emulator.status === "stopped") {
      if (iodineInstance) {
        if (timerIdRef.current) {
          clearInterval(timerIdRef.current);
          timerIdRef.current = null;
        }
        try {
          iodineInstance.stop();
        } catch (e) {}
        isPlayingRef.current = false;
        activeRomIdRef.current = null;
      }
      setIodineInstance(null);
      iodineRef.current = null;
      return;
    }

    const initInterval = setInterval(() => {
      if (biosBytesRef.current && window.GameBoyAdvanceEmulator && window.GfxGlueCode && canvasRef.current) {
        clearInterval(initInterval);

        const iodine = new window.GameBoyAdvanceEmulator();
        const blitter = new window.GfxGlueCode(240, 160);

        // Force high-level BIOS emulation (HLE) to skip boot and launch games immediately
        iodine.toggleSkipBootROM(true);

        // Attach the authentic GBA BIOS we pre-loaded on mount
        iodine.attachBIOS(biosBytesRef.current);

        // Configure standard execution timer rates (runs standard cycles per tick)
        iodine.setIntervalRate(8);

        blitter.attachCanvas(canvasRef.current);
        iodine.attachGraphicsFrameHandler(blitter);

        // Attach a play status handler to prevent silent null-pointer crashes inside the play() / pause() core methods
        iodine.attachPlayStatusHandler(() => {
        });

        // Link to global IodineGUI pointers so helper subsystems can communicate
        if (window.IodineGUI) {
          window.IodineGUI.Iodine = iodine;
          window.IodineGUI.Blitter = blitter;
        }

        if (window.GlueCodeMixer && window.GlueCodeMixerInput) {
          try {
            const mixer = new window.GlueCodeMixer();
            const mixerInput = new window.GlueCodeMixerInput(mixer);
            iodine.attachAudioHandler(mixerInput);
            iodine.enableAudio(); // Enable the audio engine inside GBA core!
          } catch (e) {
          }
        }

        iodine.attachSaveImportHandler((name: string, callback: any, callbackNoSave: any) => {
          const save = localStorage.getItem("SAVE_" + name);
          if (save) {
            callback(window.base64ToArray(save));
          } else {
            callbackNoSave();
          }
        });

        iodine.attachSaveExportHandler((name: string, saveBytes: number[]) => {
          if (name) {
            const base64Str = window.arrayToBase64(saveBytes);
            localStorage.setItem("SAVE_" + name, base64Str);
          }
        });
        
        iodineRef.current = iodine;
        setIodineInstance(iodine);
      }
    }, 100);
    
    return () => {
      clearInterval(initInterval);
    };
  }, [emulator.status]);

  // Sync volume state changes to XAudioServer and dynamic variables
  useEffect(() => {
    const activeVolume = isMuted ? 0 : volume / 100;
    
    // Set in the global variable that XAudioServer.js reads in XAudioJSWebAudioEvent
    if (typeof (window as any).XAudioJSVolume !== "undefined") {
      (window as any).XAudioJSVolume = activeVolume;
    }
    
    // Also change in active running mixer audio server if it exists
    if (iodineInstance?.audio?.mixer?.audio) {
      try {
        iodineInstance.audio.mixer.audio.changeVolume(activeVolume);
      } catch {
      }
    }
    
    localStorage.setItem("gba_volume", String(volume));
    localStorage.setItem("gba_muted", String(isMuted));
  }, [volume, isMuted, iodineInstance]);

  // Handle Web Audio context autoplay policies via user interaction gestures
  useEffect(() => {
    const resumeAudio = () => {
      if (window.XAudioJSWebAudioContextHandle && window.XAudioJSWebAudioContextHandle.state === "suspended") {
        void window.XAudioJSWebAudioContextHandle.resume().catch(() => {
        });
      }
    };

    window.addEventListener("mousedown", resumeAudio);
    window.addEventListener("keydown", resumeAudio);
    return () => {
      window.removeEventListener("mousedown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
    };
  }, []);

  // Helper to map dynamic key code to GBA index
  const getGbaKeyIndex = (code: string): number | null => {
    if (code === keybinds.a) return 0;
    if (code === keybinds.b) return 1;
    if (code === keybinds.select) return 2;
    if (code === keybinds.start) return 3;
    if (code === keybinds.right) return 4;
    if (code === keybinds.left) return 5;
    if (code === keybinds.up) return 6;
    if (code === keybinds.down) return 7;
    if (code === keybinds.r) return 8;
    if (code === keybinds.l) return 9;
    return null;
  };

  // Dedicated emulator helper functions for Quick Save/Load/Rewind
  async function performQuickSave() {
    if (!iodineRef.current) return;
    const saveBytes = iodineRef.current.IOCore.saves.exportSave();
    if (!saveBytes) {
      setFlash({ tone: "error", text: "Nothing to save yet. Run the game first." });
      return;
    }
    const saveArray = Array.from(saveBytes);
    await runAction(
      "Quick saving checkpoint",
      () => invoke<SaveEntry>("save_state", { label: "Quick Save Checkpoint", saveData: saveArray }),
      async () => {
        const nextSaves = await invoke<SaveEntry[]>("list_saves", {
          romId: saveFilter === "all" ? null : saveFilter,
        });
        setSaves(nextSaves);
        setFlash({ tone: "success", text: "Quick Save Created! 💾" });
        setTimeout(() => setFlash(null), 2000);
      }
    );
  }

  async function performQuickLoad() {
    if (!iodineRef.current || !emulator.loadedRomId) return;
    try {
      const savesList = await invoke<SaveEntry[]>("list_saves", { romId: emulator.loadedRomId });
      if (savesList.length > 0) {
        const latestSave = savesList[savesList.length - 1];
        const saveBytes = await invoke<number[]>("read_save_file", { saveId: latestSave.id });
        const convertedSave = new Uint8Array(saveBytes);
        
        const currentSaveType = iodineRef.current.IOCore.saves.exportSaveType();
        iodineRef.current.IOCore.saves.importSave(convertedSave, currentSaveType);

        const gameName = iodineRef.current.getGameName();
        if (gameName) {
          const base64Str = window.arrayToBase64(saveBytes);
          localStorage.setItem("SAVE_" + gameName, base64Str);
        }

        // Restart/reboot the core so the game loads the quickloaded cartridge save from boot!
        iodineRef.current.restart();

        setFlash({ tone: "success", text: "Quick Save Loaded! 📂" });
        setTimeout(() => setFlash(null), 2000);
      } else {
        setFlash({ tone: "error", text: "No quick save found for this game." });
      }
    } catch (e) {
      setFlash({ tone: "error", text: "Quick load failed: " + getErrorMessage(e) });
    }
  }

  async function performRewind() {
    if (!iodineRef.current || !emulator.loadedRomId) return;
    try {
      const savesList = await invoke<SaveEntry[]>("list_saves", { romId: emulator.loadedRomId });
      if (savesList.length > 0) {
        const latestSave = savesList[savesList.length - 1];
        const saveBytes = await invoke<number[]>("read_save_file", { saveId: latestSave.id });
        const convertedSave = new Uint8Array(saveBytes);
        iodineRef.current.IOCore.saves.importSave(convertedSave, 0);

        const gameName = iodineRef.current.getGameName();
        if (gameName) {
          const base64Str = window.arrayToBase64(saveBytes);
          localStorage.setItem("SAVE_" + gameName, base64Str);
        }

        // Soft-reset core to boot directly from cartridge save data
        iodineRef.current.restart();

        setFlash({ tone: "success", text: "Rewound to Last Checkpoint! ⏪" });
        setTimeout(() => setFlash(null), 2000);
      } else {
        setFlash({ tone: "error", text: "No checkpoint to rewind to. Save first!" });
      }
    } catch (e) {
      setFlash({ tone: "error", text: "Rewind failed: " + getErrorMessage(e) });
    }
  }

  function consumeKeyboardEvent(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes if the user is typing in form inputs (like state labels)
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      // If we are actively mapping a keybind
      if (bindingAction) {
        consumeKeyboardEvent(e);

        const code = e.code;
        if (code === "Escape") {
          setBindingAction(null);
          return;
        }

        setKeybinds(prev => {
          const next = { ...prev, [bindingAction]: code };
          localStorage.setItem("gba_keybinds", JSON.stringify(next));
          return next;
        });
        setBindingAction(null);
        return;
      }

      // Toggle HUD Menu on Escape if game is loaded
      if (emulator.status !== "stopped" && e.key === "Escape") {
        setShowEmuMenu(prev => {
          const next = !prev;
          if (!next) {
            setHudActiveTab("menu");
          }
          return next;
        });
        consumeKeyboardEvent(e);
        return;
      }

      // Block GBA key inputs if HUD menu is open
      if (showEmuMenu) return;

      // Emulator Action Hotkeys
      if (e.code === keybinds.quickSave && emulator.status !== "stopped") {
        void performQuickSave();
        consumeKeyboardEvent(e);
        return;
      }
      if (e.code === keybinds.quickLoad && emulator.status !== "stopped") {
        void performQuickLoad();
        consumeKeyboardEvent(e);
        return;
      }
      if (e.code === keybinds.rewind && emulator.status !== "stopped") {
        void performRewind();
        consumeKeyboardEvent(e);
        return;
      }
      if (e.code === keybinds.fastForward && emulator.status !== "stopped") {
        if (iodineRef.current) {
          iodineRef.current.setSpeed(3.0);
          setEmuFastForward(true);
        }
        consumeKeyboardEvent(e);
        return;
      }

      const index = getGbaKeyIndex(e.code);
      if (index !== null && index !== undefined && iodineRef.current && emulator.status === "running") {
        iodineRef.current.keyDown(index);
        consumeKeyboardEvent(e);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      // Ignore keystrokes if typing
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (showEmuMenu) return;

      // Fast-forward release key recovery
      if (e.code === keybinds.fastForward) {
        if (iodineRef.current) {
          iodineRef.current.setSpeed(1.0);
          setEmuFastForward(false);
        }
        consumeKeyboardEvent(e);
        return;
      }

      const index = getGbaKeyIndex(e.code);
      if (index !== null && index !== undefined && iodineRef.current && emulator.status === "running") {
        iodineRef.current.keyUp(index);
        consumeKeyboardEvent(e);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [emulator.status, showEmuMenu, keybinds, bindingAction]);

  useEffect(() => {
    let isCurrent = true;
    
    async function syncSession() {
      if (!iodineInstance) return;
      
      const iodine = iodineInstance;
      
      // Re-bind the canvas DOM node to the blitter to prevent context loss during mode-swaps
      if (window.IodineGUI && window.IodineGUI.Blitter && canvasRef.current) {
        window.IodineGUI.Blitter.attachCanvas(canvasRef.current);
      }
      
      if (emulator.loadedRomId) {
        if (activeRomIdRef.current !== emulator.loadedRomId) {
          try {
            const romBytes = await invoke<number[]>("read_rom_file", { romId: emulator.loadedRomId });
            if (!isCurrent) return;
            
            const romArray = new Uint8Array(romBytes);
            iodine.attachROM(romArray);
            activeRomIdRef.current = emulator.loadedRomId;
          } catch (err) {
            setFlash({ tone: "error", text: getErrorMessage(err) });
            return;
          }
        }

        // Apply pending save state if exists!
        if (pendingSaveStateRef.current && pendingSaveStateRef.current.romId === emulator.loadedRomId) {
          const convertedSave = pendingSaveStateRef.current.bytes;
          
          // Ensure core is initialized before importing!
          if (!iodine.IOCore) {
            iodine.play();
            startTimeRef.current = Date.now();
            isPlayingRef.current = true;
            if (timerIdRef.current) clearInterval(timerIdRef.current);
            timerIdRef.current = setInterval(() => {
              const elapsed = Date.now() - startTimeRef.current;
              iodine.timerCallback(elapsed >>> 0);
            }, 8);
          }
          
          iodine.IOCore.saves.importSave(convertedSave, 0);
          
          const gameName = iodine.getGameName();
          if (gameName) {
            const base64Str = window.arrayToBase64(Array.from(convertedSave));
            localStorage.setItem("SAVE_" + gameName, base64Str);
          }
          
          // Warm-reset/restart the core so the GBA CPU boots up and loads the new cartridge save from boot!
          iodine.restart();
          
          pendingSaveStateRef.current = null;
        }
        
        if (emulator.status === "running") {
          if (!isPlayingRef.current) {
            iodine.play();
            startTimeRef.current = Date.now();
            isPlayingRef.current = true;
            
            if (timerIdRef.current) clearInterval(timerIdRef.current);
            timerIdRef.current = setInterval(() => {
              const elapsed = Date.now() - startTimeRef.current;
              iodine.timerCallback(elapsed >>> 0);
            }, 8);
          }
        } else if (emulator.status === "paused") {
          if (isPlayingRef.current) {
            if (timerIdRef.current) {
              clearInterval(timerIdRef.current);
              timerIdRef.current = null;
            }
            iodine.pause();
            isPlayingRef.current = false;
          }
        }
      } else {
        if (isPlayingRef.current || activeRomIdRef.current !== null) {
          if (timerIdRef.current) {
            clearInterval(timerIdRef.current);
            timerIdRef.current = null;
          }
          iodine.stop();
          isPlayingRef.current = false;
          activeRomIdRef.current = null;
        }
      }
    }
    
    void syncSession();
    
    return () => {
      isCurrent = false;
    };
  }, [emulator.status, emulator.loadedRomId, iodineInstance]);

  async function runAction<T>(
    label: string,
    action: () => Promise<T>,
    onSuccess: (result: T) => void | Promise<void>,
    successText?: string,
  ) {
    setBusyAction(label);
    setFlash(null);

    try {
      const result = await action();
      await onSuccess(result);
      if (successText) {
        setFlash({ tone: "success", text: successText });
      }
    } catch (error) {
      setFlash({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshDashboard(successText?: string) {
    await runAction(
      "Refreshing dashboard",
      () => invoke<DashboardState>("get_dashboard_state"),
      (dashboard) => {
        setRoms(dashboard.roms);
        setEmulator(dashboard.emulator);
        setSaves(dashboard.saves);
      },
      successText,
    );
  }

  function applyDashboardState(dashboard: DashboardState) {
    setRoms(dashboard.roms);
    setEmulator(dashboard.emulator);
    setSaves(dashboard.saves);
  }

  function isValidRomPath(filePath: string) {
    return filePath.toLowerCase().endsWith(".gba");
  }

  async function importAndLoadRom(filePath: string, sourceLabel: string) {
    if (!isValidRomPath(filePath)) {
      setFlash({ tone: "error", text: "Choose a valid .gba ROM file." });
      return;
    }

    await runAction(
      `Importing ${sourceLabel}`,
      async () => {
        let rom: RomMetadata;

        try {
          rom = await invoke<RomMetadata>("add_rom", { filePath });
        } catch (error) {
          const message = getErrorMessage(error);
          if (message !== "ROM already exists in the library") {
            throw error;
          }

          const existingRoms = await invoke<RomMetadata[]>("list_roms");
          const existingRom = existingRoms.find((entry) => entry.filePath === filePath);

          if (!existingRom) {
            throw error;
          }

          rom = existingRom;
        }

        const session = await invoke<EmulatorSession>("load_rom", { romId: rom.id });
        const dashboard = await invoke<DashboardState>("get_dashboard_state");

        return { dashboard, session };
      },
      ({ dashboard, session }) => {
        setEmulator(session);
        applyDashboardState(dashboard);
      },
      "ROM ready in the emulator.",
    );
  }

  useEffect(() => {
    // Intercept console messages and forward them to Tauri backend
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog(...args);
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      void invoke("log_message", { level: "LOG", message: msg }).catch(() => {});
    };

    console.warn = (...args) => {
      originalWarn(...args);
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      void invoke("log_message", { level: "WARN", message: msg }).catch(() => {});
    };

    console.error = (...args) => {
      originalError(...args);
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      void invoke("log_message", { level: "ERROR", message: msg }).catch(() => {});
    };

    // Global uncaught error listener
    const handleError = (e: ErrorEvent) => {
      void invoke("log_message", { level: "CRASH", message: `${e.message} at ${e.filename}:${e.lineno}:${e.colno}` }).catch(() => {});
    };
    window.addEventListener("error", handleError);

    // Pre-load authentic GBA BIOS for synchronous attachment later
    fetch("/gba_bios.bin")
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        biosBytesRef.current = new Uint8Array(buffer);
      })
      .catch((err) => {
        console.error("Failed to load GBA BIOS:", err);
      });

    void refreshDashboard();

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      window.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const unlistenPromise = getCurrentWindow().onDragDropEvent((event) => {
      if (!isMounted) {
        return;
      }

      if (event.payload.type === "over") {
        setIsDropTargetActive(true);
        return;
      }

      if (event.payload.type === "drop") {
        setIsDropTargetActive(false);

        const droppedPath = event.payload.paths.find((path) => isValidRomPath(path));

        if (!droppedPath) {
          setFlash({ tone: "error", text: "Drop a valid .gba ROM file to import it." });
          return;
        }

        void importAndLoadRom(droppedPath, "ROM");
        return;
      }

      setIsDropTargetActive(false);
    });

    return () => {
      isMounted = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  async function handleAddRom() {
    const selectedPath = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Game Boy Advance ROM", extensions: ["gba"] }],
    });

    if (selectedPath === null) {
      return;
    }

    if (Array.isArray(selectedPath) || !selectedPath.toLowerCase().endsWith(".gba")) {
      setFlash({ tone: "error", text: "Choose a valid .gba ROM file." });
      return;
    }

    await importAndLoadRom(selectedPath, "ROM");
  }

  async function handleRefreshRoms() {
    await runAction(
      "Refreshing ROM library",
      () => invoke<RomMetadata[]>("list_roms"),
      (nextRoms) => {
        setRoms(nextRoms);
      },
      "ROM library synced.",
    );
  }

  async function handleLoadRom(romId: string) {
    setShowEmuMenu(false);
    await runAction(
      "Loading ROM",
      () => invoke<EmulatorSession>("load_rom", { romId }),
      async (session) => {
        setEmulator(session);
        await refreshDashboard("ROM loaded into the emulator.");
      },
    );
  }

  async function handleRemoveRom(romId: string) {
    await runAction(
      "Removing ROM",
      () => invoke<void>("remove_rom", { romId }),
      async () => {
        await refreshDashboard("ROM removed from the library.");
      },
    );
  }

  async function handleResume() {
    await runAction(
      "Resuming emulator",
      () => invoke<EmulatorSession>("resume_emulator"),
      (session) => {
        setEmulator(session);
      },
      "Emulator resumed.",
    );
  }

  async function handleStop() {
    // Reset state locally first for instant, zero-lag GUI transition
    setEmulator(initialEmulator);
    setShowEmuMenu(false);

    await runAction(
      "Stopping emulator",
      () => invoke<EmulatorSession>("stop_emulator"),
      (session) => {
        setEmulator(session);
      },
      "Emulator stopped.",
    );
  }

  async function handleSaveState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!iodineRef.current) {
      setFlash({ tone: "error", text: "Emulator core is not ready" });
      return;
    }

    const saveBytes = iodineRef.current.IOCore.saves.exportSave();
    if (!saveBytes) {
      setFlash({ tone: "error", text: "Nothing to save yet. Run the game first." });
      return;
    }

    const saveArray = Array.from(saveBytes);

    await runAction(
      "Creating save state",
      () => invoke<SaveEntry>("save_state", { label: saveLabel.trim() || null, saveData: saveArray }),
      async () => {
        setSaveLabel("");
        await refreshDashboard("Save state created.");
      },
    );
  }

  async function handleQuerySaves() {
    await runAction(
      "Refreshing save states",
      () =>
        invoke<SaveEntry[]>("list_saves", {
          romId: saveFilter === "all" ? null : saveFilter,
        }),
      (nextSaves) => {
        setSaves(nextSaves);
      },
      saveFilter === "all" ? "Showing all save states." : "Showing saves for the selected ROM.",
    );
  }

  async function handleLoadSave(saveId: string) {
    await runAction(
      "Loading save state",
      async () => {
        const saveBytes = await invoke<number[]>("read_save_file", { saveId });
        const pausedSession = await invoke<EmulatorSession>("load_state", { saveId });

        if (!pausedSession.loadedRomId) {
          throw new Error("Save state is missing an associated ROM.");
        }

        const convertedSave = new Uint8Array(saveBytes);
        pendingSaveStateRef.current = {
          bytes: convertedSave,
          romId: pausedSession.loadedRomId,
        };

        // If the core is already running, we can immediately apply it!
        if (iodineRef.current && activeRomIdRef.current === pausedSession.loadedRomId) {
          const currentSaveType = iodineRef.current.IOCore.saves.exportSaveType();
          iodineRef.current.IOCore.saves.importSave(convertedSave, currentSaveType);
          
          const gameName = iodineRef.current.getGameName();
          if (gameName) {
            const base64Str = window.arrayToBase64(saveBytes);
            localStorage.setItem("SAVE_" + gameName, base64Str);
          }

          // Warm-reboot the core so the game re-reads the imported save from boot!
          iodineRef.current.restart();

          pendingSaveStateRef.current = null;
        }

        return pausedSession;
      },
      (session) => {
        setEmulator(session);
      },
      "Save state loaded into the emulator.",
    );
  }

  const recentRoms = [...roms]
    .sort((a, b) => {
      const aTime = a.lastPlayedAt || 0;
      const bTime = b.lastPlayedAt || 0;
      return bTime - aTime;
    })
    .slice(0, 3);

  const recentSaves = [...saves]
    .sort((a, b) => {
      const aTime = a.createdAt || 0;
      const bTime = b.createdAt || 0;
      return bTime - aTime;
    })
    .slice(0, 4);

  const isBusy = busyAction !== null;

  if (emulator.status !== "stopped") {
    return (
      <main className="game-mode-wrapper" style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "#080c18",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        fontFamily: "'Silkscreen', monospace"
      }}>
        {/* Retro GBA Console Frame */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.2rem", maxWidth: "90%" }}>
          <div className="gba-housing" style={{ width: "680px", maxWidth: "100%" }}>
            <div className="gba-screen-bezel">
              <div className="gba-logo-led">
                <div className="gba-logo-text">GAME BOY ADVANCE</div>
                <div className="gba-battery-indicator">
                  <div className="gba-battery-label">POWER</div>
                  <div className={`gba-battery-led ${emulator.status === "running" ? "running" : "paused"}`} />
                </div>
              </div>

              {emuFastForward && (
                <div className="ff-indicator">FAST FORWARD &gt;&gt;</div>
              )}

              <canvas
                ref={canvasRef}
                id="emulator_target"
                width="240"
                height="160"
                style={{
                  width: "100%",
                  aspectRatio: "240/160",
                  imageRendering: "pixelated",
                  background: "#000",
                  display: "block",
                  borderRadius: "12px 12px 68px 12px"
                }}
              />
            </div>
          </div>
          
          {/* Quick HUD controls help guide */}
          <div style={{ 
            display: "flex", 
            gap: "1.5rem", 
            alignItems: "center", 
            color: "#8fa5c7", 
            fontSize: "0.75rem", 
            fontFamily: "'Press Start 2P', monospace",
            textShadow: "1px 1px 0px #000",
            flexWrap: "wrap",
            justifyContent: "center",
            textAlign: "center"
          }}>
            <div>[ESC] or [{keybinds.select.replace("Key", "").replace("Digit", "").replace("Backquote", "`")}] MENU</div>
            <div>[{keybinds.fastForward.replace("Key", "").replace("Digit", "")}] FF (HOLD)</div>
            <div>[{keybinds.rewind.replace("Key", "").replace("Digit", "")}] REWIND</div>
            <div>[{keybinds.quickSave.replace("Key", "").replace("Digit", "")}] QUICK SAVE</div>
            <div>[{keybinds.quickLoad.replace("Key", "").replace("Digit", "")}] QUICK LOAD</div>
          </div>
        </div>

        {/* Floating HUD Emulator Menu Modal Overlay */}
        {showEmuMenu && (
          <div className="emu-menu-overlay" style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10000
          }}>
            {hudActiveTab === "menu" ? (
              <div className="card emu-menu-card" style={{
                width: "360px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: "1rem"
              }}>
                <div>
                  <h3 style={{ fontSize: "1.1rem", color: "#ffde59", marginBottom: "8px" }}>PAUSED</h3>
                  <p style={{ margin: "4px 0", color: "#fff", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emulator.loadedRomTitle}</p>
                  <div className="pill" style={{ marginTop: "8px", display: "inline-block" }}>
                    {emulator.status}
                  </div>
                </div>

                {/* Volume sliders in HUD */}
                <div style={{ border: "4px solid #41557d", padding: "12px", background: "#0d1424", margin: "4px 0", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.65rem", fontFamily: "'Press Start 2P', monospace", color: "#ffde59" }}>VOLUME</span>
                    <span style={{ fontSize: "0.75rem" }}>{isMuted ? "MUTED" : `${volume}%`}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button 
                      type="button" 
                      onClick={() => setIsMuted(!isMuted)}
                      style={{ padding: "4px 8px", fontSize: "0.75rem", minWidth: "65px", boxShadow: "none", top: 0, border: "2px solid #000" }}
                    >
                      {isMuted ? "UNMUTE" : "MUTE"}
                    </button>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={volume} 
                      onChange={(e) => setVolume(Number(e.target.value))}
                      style={{ flex: 1, height: "12px", border: "2px solid #fff", borderRadius: "0px", cursor: "pointer", background: "#000", padding: "0" }}
                    />
                  </div>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmuMenu(false);
                      setHudActiveTab("menu");
                      if (emulator.status === "paused") {
                        void handleResume();
                      }
                    }}
                    className="confirm-btn"
                  >
                    RESUME GAME
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await performQuickSave();
                    }}
                  >
                    QUICK SAVE ({keybinds.quickSave.replace("Digit", "")})
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await performQuickLoad();
                      setShowEmuMenu(false);
                      setHudActiveTab("menu");
                      if (emulator.status === "paused") {
                        void handleResume();
                      }
                    }}
                  >
                    QUICK LOAD ({keybinds.quickLoad.replace("Digit", "")})
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await performRewind();
                      setShowEmuMenu(false);
                      setHudActiveTab("menu");
                      if (emulator.status === "paused") {
                        void handleResume();
                      }
                    }}
                    className="warning-btn"
                  >
                    REWIND TO SAVE ({keybinds.rewind.replace("Key", "").replace("Digit", "")})
                  </button>

                  <button
                    type="button"
                    onClick={() => setHudActiveTab("controls")}
                    style={{ backgroundColor: "#2e3a5a", border: "4px solid #41557d" }}
                  >
                    CONFIGURE CONTROLS ⌨️
                  </button>

                  <div style={{ height: "4px", background: "#41557d", margin: "4px 0" }}></div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowEmuMenu(false);
                      setHudActiveTab("menu");
                      void handleStop();
                    }}
                    className="danger"
                  >
                    QUIT TO MENU
                  </button>
                </div>
              </div>
            ) : (
              <div className="card emu-menu-card" style={{
                width: "420px",
                maxHeight: "85vh",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                overflow: "hidden"
              }}>
                <div>
                  <h3 style={{ fontSize: "1.1rem", color: "#ffde59", marginBottom: "4px" }}>CONTROLS MAPPER</h3>
                  <p style={{ margin: "4px 0", color: "#fff", fontSize: "0.75rem" }}>
                    Click to map, then press any key. ESC to cancel.
                  </p>
                </div>

                <div className="hud-keybindings-list" style={{
                  flex: 1,
                  overflowY: "auto",
                  border: "4px solid #41557d",
                  background: "#0d1424",
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}>
                  {(Object.keys(KEY_LABELS) as Array<keyof Keybinds>).map((action) => {
                    const isBinding = bindingAction === action;
                    return (
                      <div key={action} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 8px",
                        background: isBinding ? "rgba(255, 222, 89, 0.1)" : "#162035",
                        border: "2px solid " + (isBinding ? "#ffde59" : "#41557d")
                      }}>
                        <span style={{ fontSize: "0.7rem", fontFamily: "'Silkscreen', monospace", color: "#8fa5c7" }}>
                          {KEY_LABELS[action]}
                        </span>
                        <button
                          type="button"
                          className={`keybinding-btn ${isBinding ? "binding" : ""}`}
                          onClick={() => setBindingAction(action)}
                          style={{
                            minWidth: "120px",
                            padding: "2px 6px",
                            fontSize: "0.7rem",
                            height: "auto",
                            boxShadow: "none",
                            top: 0
                          }}
                        >
                          {isBinding ? "PRESS KEY..." : keybinds[action].replace("Key", "").replace("Digit", "").toUpperCase()}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setKeybinds(DEFAULT_KEYBINDS);
                      localStorage.setItem("gba_keybinds", JSON.stringify(DEFAULT_KEYBINDS));
                      setFlash({ tone: "success", text: "Controls reset to default!" });
                      setTimeout(() => setFlash(null), 2000);
                    }}
                    style={{ flex: 1, padding: "8px", fontSize: "0.75rem" }}
                  >
                    RESET ALL
                  </button>
                  <button
                    type="button"
                    onClick={() => setHudActiveTab("menu")}
                    className="confirm-btn"
                    style={{ flex: 1, padding: "8px", fontSize: "0.75rem" }}
                  >
                    BACK TO MENU
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className={`app-shell ${isDropTargetActive ? "drop-target-active" : ""}`}>
      <section className={`hero card ${isDropTargetActive ? "hero-drop-target" : ""}`}>
        <div>
          <p className="eyebrow">Tauri v2 + React Dashboard</p>
          <h1>GBA Emulator Control Center</h1>
          <p className="hero-copy">
            Manage your ROM library, control the current session, and create save states from a
            single desktop dashboard.
          </p>
          <p className="drop-hint">Drop a `.gba` file anywhere in the window to import and launch it instantly.</p>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={() => void refreshDashboard("Dashboard refreshed.")} disabled={isBusy}>
            Refresh dashboard
          </button>
          <span className="busy-label">{busyAction ?? "Ready"}</span>
        </div>
      </section>

      {flash ? <div className={`flash ${flash.tone}`}>{flash.text}</div> : null}

      <section className="stats-grid quick-resume-grid">
        <article className="card panel quick-resume-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Last played ROMs</p>
              <h2>Jump back into your favorites</h2>
            </div>
          </div>

          <div className="list compact-list">
            {recentRoms.length === 0 ? (
              <div className="empty-state">Play a cartridge once and it will show up here for quick resume.</div>
            ) : (
              recentRoms.map((rom) => (
                <div className="list-item" key={rom.id}>
                  <div className="list-copy">
                    <div className="title-row">
                      <h3>{rom.title}</h3>
                      {rom.favorite ? <span className="pill">Favorite</span> : null}
                    </div>
                    <p>{rom.fileName}</p>
                    <small>Last played: {formatTimestamp(rom.lastPlayedAt)}</small>
                  </div>
                  <div className="item-actions">
                    <button type="button" onClick={() => void handleLoadRom(rom.id)} disabled={isBusy}>
                      Resume
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <small className="panel-footer-copy">Library storage: {formatBytes(totalStorage)}</small>
        </article>

        <article className="card panel quick-resume-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Recent saves</p>
              <h2>Restore your latest checkpoints</h2>
            </div>
          </div>

          <div className="list compact-list">
            {recentSaves.length === 0 ? (
              <div className="empty-state">No save states yet. Create one in-game or from the save panel.</div>
            ) : (
              recentSaves.map((save) => (
                <div className="list-item" key={save.id}>
                  <div className="list-copy">
                    <div className="title-row">
                      <h3>{save.label}</h3>
                      <span className="pill secondary">{save.kind}</span>
                    </div>
                    <p>{save.romTitle}</p>
                    <small>{formatTimestamp(save.createdAt)}</small>
                  </div>
                  <div className="item-actions">
                    <button type="button" onClick={() => void handleLoadSave(save.id)} disabled={isBusy}>
                      Load save
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <small className="panel-footer-copy">{activeRom ? `Current focus: ${activeRom.title}` : "No ROM is currently active."}</small>
        </article>
      </section>

      <section className="content-grid">
        <article className="card panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ROM library</p>
              <h2>Import and launch cartridges</h2>
            </div>
            <button type="button" onClick={() => void handleRefreshRoms()} disabled={isBusy}>
              Sync ROMs
            </button>
          </div>

          <div className="inline-form">
            <button type="button" onClick={() => void handleAddRom()} disabled={isBusy}>
              Add ROM
            </button>
          </div>

          {isDropTargetActive ? <div className="drop-zone-banner">Release to import and auto-load your ROM.</div> : null}

          <div className="list">
            {roms.length === 0 ? (
              <div className="empty-state">No ROMs added yet. Use the picker or drop a `.gba` file into the window.</div>
            ) : (
              roms.map((rom) => (
                <div className="list-item" key={rom.id}>
                  <div className="list-copy">
                    <div className="title-row">
                      <h3>{rom.title}</h3>
                      {rom.favorite ? <span className="pill">Favorite</span> : null}
                    </div>
                    <p>{rom.fileName}</p>
                    <small>{rom.filePath}</small>
                    <div className="meta-row">
                      <span>{formatBytes(rom.sizeBytes)}</span>
                      <span>Last played: {formatTimestamp(rom.lastPlayedAt)}</span>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button type="button" onClick={() => void handleLoadRom(rom.id)} disabled={isBusy}>
                      Load
                    </button>
                    <button type="button" className="danger" onClick={() => void handleRemoveRom(rom.id)} disabled={isBusy}>
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="card panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Save states</p>
              <h2>Capture and restore progress</h2>
            </div>
            <button type="button" onClick={() => void handleQuerySaves()} disabled={isBusy}>
              Query saves
            </button>
          </div>

          <form className="inline-form" onSubmit={handleSaveState}>
            <input
              value={saveLabel}
              onChange={(event) => setSaveLabel(event.currentTarget.value)}
              placeholder="Champion Road checkpoint"
              disabled={isBusy}
            />
            <button type="submit" disabled={isBusy}>
              Create save
            </button>
          </form>

          <div className="filter-row">
            <label htmlFor="save-filter">Filter</label>
            <select
              id="save-filter"
              value={saveFilter}
              onChange={(event) => setSaveFilter(event.currentTarget.value)}
              disabled={isBusy}
            >
              <option value="all">All ROMs</option>
              {roms.map((rom) => (
                <option key={rom.id} value={rom.id}>
                  {rom.title}
                </option>
              ))}
            </select>
          </div>

          <div className="list">
            {visibleSaves.length === 0 ? (
              <div className="empty-state">No save states match the current filter.</div>
            ) : (
              visibleSaves.map((save) => (
                <div className="list-item" key={save.id}>
                  <div className="list-copy">
                    <div className="title-row">
                      <h3>{save.label}</h3>
                      <span className="pill secondary">{save.kind}</span>
                    </div>
                    <p>{save.romTitle}</p>
                    <small>{save.filePath}</small>
                    <div className="meta-row">
                      <span>{save.id}</span>
                      <span>{formatTimestamp(save.createdAt)}</span>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button type="button" onClick={() => void handleLoadSave(save.id)} disabled={isBusy}>
                      Load save
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        {/* Controller & Keybind Configuration Panel */}
        <article className="card panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Settings</p>
              <h2>Keyboard & Audio Controls</h2>
            </div>
            <button type="button" onClick={() => {
              setKeybinds(DEFAULT_KEYBINDS);
              localStorage.setItem("gba_keybinds", JSON.stringify(DEFAULT_KEYBINDS));
              setFlash({ tone: "success", text: "Controls reset to default!" });
              setTimeout(() => setFlash(null), 2000);
            }}>
              Reset to Defaults
            </button>
          </div>

          <div className="content-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* Audio Settings (HP/Volume style from Image 1) */}
            <div style={{ border: "4px solid #41557d", padding: "16px", background: "#0d1424" }}>
              <h3 style={{ fontSize: "1rem", color: "#ffde59", marginBottom: "16px" }}>AUDIO ENGINE</h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.85rem", textTransform: "uppercase" }}>Master Volume:</span>
                  <span style={{ fontSize: "0.85rem", color: "#ffde59", fontFamily: "'Press Start 2P', monospace" }}>
                    {isMuted ? "MUTED" : `${volume}%`}
                  </span>
                </div>

                {/* HP/Volume bar like Image 1 */}
                <div className="pixel-gauge-container">
                  <div className="pixel-gauge-bar" style={{ width: "100%", height: "28px" }}>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const active = !isMuted && (volume > (i * 10));
                      return (
                        <div 
                          key={i} 
                          className={`pixel-gauge-chunk ${active ? "" : "empty"}`} 
                          style={{
                            backgroundColor: active ? (i < 3 ? "#22c55e" : i < 7 ? "#eab308" : "#ef4444") : "#1a273b"
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <button 
                    type="button" 
                    onClick={() => setIsMuted(!isMuted)}
                    style={{ flex: 1 }}
                  >
                    {isMuted ? "UNMUTE AUDIO" : "MUTE AUDIO"}
                  </button>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={volume} 
                    onChange={(e) => setVolume(Number(e.target.value))}
                    style={{ flex: 2, height: "16px", border: "4px solid #000", borderRadius: "0px", cursor: "pointer", padding: "0" }}
                  />
                </div>
                <small style={{ color: "#a3b8cc", fontSize: "0.8rem", marginTop: "8px", display: "block" }}>
                  * GBA sound is synthesized in real-time via Web Audio API. Autoplay policy will activate audio on click/press.
                </small>
              </div>
            </div>

            {/* Keybind Settings */}
            <div>
              <h3 style={{ fontSize: "1rem", color: "#ffde59", marginBottom: "16px" }}>KEYBINDINGS</h3>
              <p style={{ fontSize: "0.85rem", color: "#a3b8cc", marginBottom: "12px" }}>
                Click a button below, then press any key on your keyboard to map the action. Press ESC to cancel.
              </p>
              
              <div className="keybindings-grid">
                {(Object.keys(KEY_LABELS) as Array<keyof Keybinds>).map((action) => {
                  const isBinding = bindingAction === action;
                  return (
                    <div key={action} className="keybinding-row">
                      <span className="keybinding-label">{KEY_LABELS[action]}</span>
                      <button
                        type="button"
                        className={`keybinding-btn ${isBinding ? "binding" : ""}`}
                        onClick={() => setBindingAction(action)}
                        style={{ minWidth: "120px", padding: "4px 8px", fontSize: "0.75rem", height: "auto" }}
                      >
                        {isBinding ? "PRESS KEY..." : keybinds[action].replace("Key", "").replace("Digit", "").toUpperCase()}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
