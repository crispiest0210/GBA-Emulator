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
  }
}

const KEY_MAP: { [key: string]: number } = {
  KeyX: 0,       // A
  KeyZ: 1,       // B
  ShiftLeft: 2,  // Select
  ShiftRight: 2, // Select
  Enter: 3,      // Start
  ArrowRight: 4, // Right
  ArrowLeft: 5,  // Left
  ArrowUp: 6,    // Up
  ArrowDown: 7,  // Down
  KeyS: 8,       // R
  KeyA: 9,       // L
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
  const [visibleSaves, setVisibleSaves] = useState<SaveEntry[]>([]);
  const [emulator, setEmulator] = useState<EmulatorSession>(initialEmulator);
  const [saveLabel, setSaveLabel] = useState("");
  const [saveFilter, setSaveFilter] = useState<string>("all");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const [showEmuMenu, setShowEmuMenu] = useState(false);
  const [iodineInstance, setIodineInstance] = useState<any>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iodineRef = useRef<any>(null);
  const isPlayingRef = useRef<boolean>(false);
  const timerIdRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());
  const activeRomIdRef = useRef<string | null>(null);
  const timerLogCountRef = useRef<number>(0);
  const frameLogCountRef = useRef<number>(0);

  const activeRom = useMemo(
    () => roms.find((rom) => rom.id === emulator.loadedRomId) ?? null,
    [emulator.loadedRomId, roms],
  );

  const totalStorage = useMemo(
    () => roms.reduce((sum, rom) => sum + rom.sizeBytes, 0),
    [roms],
  );

  useEffect(() => {
    setVisibleSaves(saveFilter === "all" ? saves : saves.filter((save) => save.romId === saveFilter));
  }, [saveFilter, saves]);

  useEffect(() => {
    const initInterval = setInterval(() => {
      if (window.GameBoyAdvanceEmulator && window.GfxGlueCode && canvasRef.current) {
        clearInterval(initInterval);
        
        console.log("React: Instantiating GameBoyAdvanceEmulator core...");
        const iodine = new window.GameBoyAdvanceEmulator();
        const blitter = new window.GfxGlueCode(240, 160);
        const originalInitializeCore = iodine.initializeCore?.bind(iodine);
        const originalPlay = iodine.play?.bind(iodine);
        const originalTimerCallback = iodine.timerCallback?.bind(iodine);
        const originalCopyBuffer = blitter.copyBuffer?.bind(blitter);
        
        // Force high-level BIOS emulation (HLE) to skip boot and launch games immediately
        iodine.toggleSkipBootROM(true);
        
        // Attach a 16KB dummy BIOS array initially to satisfy immediate initialization checks
        const dummyBios = new Uint8Array(16384);
        iodine.attachBIOS(dummyBios);

        // Fetch and attach the authentic GBA BIOS to allow successful SWI execution
        fetch("/gba_bios.bin")
          .then((res) => res.arrayBuffer())
          .then((buffer) => {
            const realBios = new Uint8Array(buffer);
            if (realBios.length === 16384) {
              iodine.attachBIOS(realBios);
              console.log("React: Authentic GBA BIOS successfully attached!");
            } else {
              console.error("React: Loaded GBA BIOS has invalid size", realBios.length);
            }
          })
          .catch((err) => {
            console.error("React: Failed to load GBA BIOS. Falling back to dummy BIOS.", err);
          });
        
        // Configure standard execution timer rates (runs standard cycles per tick)
        iodine.setIntervalRate(8);
        
        blitter.attachCanvas(canvasRef.current);
        blitter.copyBuffer = (buffer: Uint8Array) => {
          if (frameLogCountRef.current < 5) {
            console.log("React: Received frame buffer", {
              length: buffer?.length,
              sample: Array.from(buffer?.slice?.(0, 12) ?? []),
            });
            frameLogCountRef.current += 1;
          }
          return originalCopyBuffer?.(buffer);
        };
        iodine.attachGraphicsFrameHandler(blitter);
        iodine.initializeCore = () => {
          const result = originalInitializeCore ? originalInitializeCore() : 0;
          console.log("React: initializeCore() completed", {
            result,
            emulatorStatus: iodine.emulatorStatus,
            hasIOCore: Boolean(iodine.IOCore),
          });
          return result;
        };
        iodine.play = () => {
          console.log("React: play() invoked", {
            emulatorStatusBefore: iodine.emulatorStatus,
            hasBIOS: Boolean(iodine.BIOS),
            biosLength: iodine.BIOS?.length,
            hasROM: Boolean(iodine.ROM),
            romLength: iodine.ROM?.length,
          });
          const result = originalPlay ? originalPlay() : undefined;
          console.log("React: play() completed", {
            emulatorStatusAfter: iodine.emulatorStatus,
            hasIOCore: Boolean(iodine.IOCore),
          });
          return result;
        };
        iodine.timerCallback = (lastTimestamp: number) => {
          if (timerLogCountRef.current < 8) {
            console.log("React: timerCallback() tick", {
              lastTimestamp,
              emulatorStatus: iodine.emulatorStatus,
              hasIOCore: Boolean(iodine.IOCore),
            });
            timerLogCountRef.current += 1;
          }
          return originalTimerCallback?.(lastTimestamp);
        };
        
        // Attach a play status handler to prevent silent null-pointer crashes inside the play() / pause() core methods
        iodine.attachPlayStatusHandler((status: number) => {
          console.log("React: Emulator play status changed to: ", status);
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
          } catch (e) {
            console.warn("React: Audio mixer failed to register:", e);
          }
        }
        
        iodine.attachSaveImportHandler((name: string, callback: any, callbackNoSave: any) => {
          const save = localStorage.getItem("SAVE_" + name);
          if (save) {
            console.log("React: Loading battery save from local storage for: ", name);
            callback(window.base64ToArray(save));
          } else {
            callbackNoSave();
          }
        });
        
        iodine.attachSaveExportHandler((name: string, saveBytes: number[]) => {
          if (name) {
            const base64Str = window.arrayToBase64(saveBytes);
            localStorage.setItem("SAVE_" + name, base64Str);
            console.log("React: Saved game inside cartridge: ", name);
          }
        });
        
        iodineRef.current = iodine;
        setIodineInstance(iodine);
      }
    }, 100);
    
    return () => {
      clearInterval(initInterval);
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle HUD Menu on Escape or Backquote (tilde ~) if game is loaded
      if (emulator.status !== "stopped" && (e.key === "Escape" || e.code === "Backquote")) {
        setShowEmuMenu(prev => !prev);
        e.preventDefault();
        return;
      }

      // Block GBA key inputs if HUD menu is open
      if (showEmuMenu) return;

      const index = KEY_MAP[e.code];
      if (index !== undefined && iodineRef.current && emulator.status === "running") {
        iodineRef.current.keyDown(index);
        e.preventDefault();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      // Block key dispatches if HUD is active
      if (showEmuMenu) return;

      const index = KEY_MAP[e.code];
      if (index !== undefined && iodineRef.current && emulator.status === "running") {
        iodineRef.current.keyUp(index);
        e.preventDefault();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [emulator.status, showEmuMenu]);

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
          console.log("React: Loading ROM binary for ID: ", emulator.loadedRomId);
          try {
            const base64Str = await invoke<string>("read_rom_file", { romId: emulator.loadedRomId });
            if (!isCurrent) return;
            
            const romArray = new Uint8Array(window.base64ToArray(base64Str));
            console.log("React: Decoded ROM payload", {
              base64Length: base64Str.length,
              romLength: romArray.length,
              headerSample: Array.from(romArray.slice(0, 16)),
              titleSample: String.fromCharCode(...Array.from(romArray.slice(0xa0, 0xac))),
            });
            iodine.attachROM(romArray);
            console.log("React: attachROM() completed", {
              emulatorStatus: iodine.emulatorStatus,
              attachedRomLength: iodine.ROM?.length,
            });
            activeRomIdRef.current = emulator.loadedRomId;
            console.log("React: Cartridge inserted!");
          } catch (err) {
            setFlash({ tone: "error", text: getErrorMessage(err) });
            return;
          }
        }
        
        if (emulator.status === "running") {
          if (!isPlayingRef.current) {
            console.log("React: Starting execution loop...");
            timerLogCountRef.current = 0;
            frameLogCountRef.current = 0;
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
            console.log("React: Pausing execution loop...");
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
          console.log("React: Stopping emulator core...");
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
    void refreshDashboard();
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

  async function handleRefreshEmulator() {
    await runAction(
      "Refreshing emulator state",
      () => invoke<EmulatorSession>("get_emulator_state"),
      (session) => {
        setEmulator(session);
      },
      "Emulator state refreshed.",
    );
  }

  async function handlePause() {
    await runAction(
      "Pausing emulator",
      () => invoke<EmulatorSession>("pause_emulator"),
      (session) => {
        setEmulator(session);
      },
      "Emulator paused.",
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
        setVisibleSaves(nextSaves);
      },
      saveFilter === "all" ? "Showing all save states." : "Showing saves for the selected ROM.",
    );
  }

  async function handleLoadSave(saveId: string) {
    if (!iodineRef.current) {
      setFlash({ tone: "error", text: "Emulator core is not ready" });
      return;
    }

    await runAction(
      "Loading save state",
      async () => {
        const saveBytes = await invoke<number[]>("read_save_file", { saveId });
        const convertedSave = new Uint8Array(saveBytes);
        iodineRef.current.IOCore.saves.importSave(convertedSave, 0);

        return invoke<EmulatorSession>("load_state", { saveId });
      },
      (session) => {
        setEmulator(session);
      },
      "Save state loaded into the emulator.",
    );
  }

  const isBusy = busyAction !== null;

  if (emulator.status !== "stopped") {
    return (
      <main className="game-mode-wrapper" style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "#080808",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}>
        {/* Centered screen container */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <canvas
            ref={canvasRef}
            id="emulator_target"
            width="240"
            height="160"
            style={{
              width: "auto",
              height: "82vh",
              maxHeight: "85vh",
              aspectRatio: "240/160",
              imageRendering: "pixelated",
              border: "16px solid #1a1a1a",
              borderRadius: "16px",
              boxShadow: "0 30px 60px rgba(0,0,0,0.9)",
              background: "#000"
            }}
          />
          <div style={{ color: "#71717a", fontSize: "0.85rem", letterSpacing: "0.02em" }}>
            Press <kbd style={{ background: "#27272a", color: "#fff", padding: "3px 6px", borderRadius: "4px", border: "1px solid #3f3f46", fontSize: "0.75rem", fontFamily: "monospace" }}>ESC</kbd> or <kbd style={{ background: "#27272a", color: "#fff", padding: "3px 6px", borderRadius: "4px", border: "1px solid #3f3f46", fontSize: "0.75rem", fontFamily: "monospace" }}>~</kbd> to open Emulator HUD Menu
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
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10000
          }}>
            <div className="emu-menu-card" style={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "12px",
              padding: "2rem",
              width: "340px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
              textAlign: "center"
            }}>
              <div>
                <h3 style={{ margin: 0, color: "#fff", fontSize: "1.35rem", fontWeight: "bold", letterSpacing: "-0.025em" }}>Emulator Menu</h3>
                <p style={{ margin: "4px 0 0 0", color: "#a1a1aa", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emulator.loadedRomTitle}</p>
                <div style={{ display: "inline-block", background: "#27272a", color: "#3b82f6", padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold", marginTop: "8px" }}>
                  {emulator.status}
                </div>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmuMenu(false);
                    if (emulator.status === "paused") {
                      void handleResume();
                    }
                  }}
                  style={{ background: "#2563eb", color: "#fff", border: "none", padding: "0.75rem", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "0.9rem", transition: "background 0.2s" }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#1d4ed8")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#2563eb")}
                >
                  Resume Gameplay (ESC)
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (iodineRef.current) {
                      const saveBytes = iodineRef.current.IOCore.saves.exportSave();
                      if (saveBytes) {
                        const saveArray = Array.from(saveBytes);
                        await invoke("save_state", { label: "Quick Save Checkpoint", saveData: saveArray });
                        await refreshDashboard();
                        alert("Checkpoint saved successfully!");
                      } else {
                        alert("Save error: Game has not generated save data yet.");
                      }
                    }
                  }}
                  style={{ background: "#27272a", color: "#fff", border: "1px solid #3f3f46", padding: "0.75rem", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "0.9rem" }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#3f3f46")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#27272a")}
                >
                  Create Save Checkpoint 💾
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const savesList = await invoke<SaveEntry[]>("list_saves", { romId: emulator.loadedRomId });
                      if (savesList.length > 0) {
                        const latestSave = savesList[savesList.length - 1];
                        const saveBytes = await invoke<number[]>("read_save_file", { saveId: latestSave.id });
                        const convertedSave = new Uint8Array(saveBytes);
                        iodineRef.current.IOCore.saves.importSave(convertedSave, 0);
                        setShowEmuMenu(false);
                        if (emulator.status === "paused") {
                          void handleResume();
                        }
                        alert("Loaded last checkpoint successfully!");
                      } else {
                        alert("No checkpoints found. Save within the emulator menu first!");
                      }
                    } catch (e) {
                      alert("Load error: " + getErrorMessage(e));
                    }
                  }}
                  style={{ background: "#27272a", color: "#fff", border: "1px solid #3f3f46", padding: "0.75rem", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "0.9rem" }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#3f3f46")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#27272a")}
                >
                  Restore Last Checkpoint 📂
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (emulator.status === "running") {
                      void handlePause();
                    } else {
                      void handleResume();
                    }
                  }}
                  style={{ background: "#27272a", color: "#fff", border: "1px solid #3f3f46", padding: "0.75rem", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "0.9rem" }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#3f3f46")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#27272a")}
                >
                  {emulator.status === "running" ? "Pause Emulation ⏸️" : "Resume Emulation ▶️"}
                </button>

                <div style={{ height: "1px", background: "#3f3f46", margin: "4px 0" }}></div>

                <button
                  type="button"
                  onClick={() => {
                    setShowEmuMenu(false);
                    void handleStop();
                  }}
                  style={{ background: "#dc2626", color: "#fff", border: "none", padding: "0.75rem", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "0.9rem" }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#b91c1c")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#dc2626")}
                >
                  Exit to Dashboard 🛑
                </button>
              </div>
            </div>
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

      <section className="stats-grid">
        <article className="card stat-card">
          <span className="stat-label">ROMs</span>
          <strong>{roms.length}</strong>
          <small>{formatBytes(totalStorage)} total storage</small>
        </article>
        <article className="card stat-card">
          <span className="stat-label">Session</span>
          <strong>{emulator.status}</strong>
          <small>{emulator.loadedRomTitle ?? "No ROM loaded"}</small>
        </article>
        <article className="card stat-card">
          <span className="stat-label">Save states</span>
          <strong>{saves.length}</strong>
          <small>{activeRom ? `Active ROM: ${activeRom.title}` : "Waiting for a loaded ROM"}</small>
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

        <article className="card panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Emulator session</p>
              <h2>Runtime controls</h2>
            </div>
            <button type="button" onClick={() => void handleRefreshEmulator()} disabled={isBusy}>
              Refresh session
            </button>
          </div>

          <div className="session-card">
            <div className="status-row">
              <span className={`status-dot ${emulator.status.toLowerCase()}`} />
              <strong>{emulator.status}</strong>
            </div>

            <div className="emulator-screen-container" style={{ margin: "1rem 0", background: "#111", borderRadius: "8px", border: "1px solid #333", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", aspectRatio: "240/160", width: "100%", height: "200px" }}>
              <div style={{ color: "#888", fontSize: "0.9rem", textAlign: "center", padding: "1rem" }}>
                No active game running. Load a ROM to play in fullscreen!
              </div>
            </div>

            <dl className="details-grid">
              <div>
                <dt>Loaded ROM</dt>
                <dd>{emulator.loadedRomTitle ?? "Nothing loaded"}</dd>
              </div>
              <div>
                <dt>FPS target</dt>
                <dd>{emulator.fpsTarget}</dd>
              </div>
              <div>
                <dt>Audio</dt>
                <dd>{emulator.audioEnabled ? "Enabled" : "Muted"}</dd>
              </div>
              <div>
                <dt>Fast forward</dt>
                <dd>{emulator.fastForward ? "On" : "Off"}</dd>
              </div>
            </dl>
          </div>

          <div className="control-row">
            <button type="button" onClick={() => void handlePause()} disabled={isBusy}>
              Pause
            </button>
            <button type="button" onClick={() => void handleResume()} disabled={isBusy}>
              Resume
            </button>
            <button type="button" onClick={() => void handleStop()} disabled={isBusy}>
              Stop
            </button>
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
      </section>
    </main>
  );
}

export default App;
