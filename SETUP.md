# Developer Setup and Installation Guide

This document contains step-by-step instructions for installing compile dependencies, running the development environment, and compiling production desktop installers for **Windows**, **macOS**, and **Linux (Rocky/RHEL and Debian/Ubuntu)**.

---

## 📋 Common Requirements

On all operating systems, you must have the following general prerequisites installed:

1. [Node.js](https://nodejs.org/) (v18 or higher recommended)
2. [Rust Toolchain & Cargo](https://rustup.rs/) (v1.75 or higher)

---

## 🐧 Linux Setup

Tauri requires native WebKitGTK and GTK compiler headers.

### 1. Automatic Installer (Debian/Ubuntu & Rocky/RHEL/CentOS)
We provide an automatic installer script that detects your distribution, registers required repositories (like EPEL and CRB on Red Hat-based systems), and installs the dependencies.

Run it inside the project directory:
```bash
./setup_linux_deps.sh
```

### 2. Manual Installation

#### Debian or Ubuntu
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

#### Rocky Linux 9, RHEL 9, or CentOS Stream 9
Enable the CodeReady Builder (CRB) and EPEL repositories, then install the developer headers:
```bash
# Enable package repositories
sudo dnf config-manager --set-enabled crb
sudo dnf install -y epel-release
sudo dnf clean all && sudo dnf makecache

# Install compiling tools and developer libraries
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y webkit2gtk3-devel libsoup-devel gtk3-devel glib2-devel openssl-devel pkgconf-pkg-config
```

*Note for Red Hat-based systems:* Rocky Linux 9 ships with GLib v2.68.4 and WebKitGTK linked against libsoup-2.4, while Tauri 2's Linux target default compiles against GLib >= 2.70 and libsoup-3.0. 
Our `./setup_linux_deps.sh` installer automatically solves this by building a local `./pkgconfig/` spoofing directory which maps these compiler checks back to your system's stable packages. 

When running or building the app on Rocky Linux, you must prefix your commands with the local `PKG_CONFIG_PATH` (see below).

---

## 🍏 macOS Setup

1. **Install Apple Compilation Command Line Tools**:
   Open a terminal and run:
   ```bash
   xcode-select --install
   ```

2. **Verify Rust**:
   Ensure Rust target is configured correctly:
   ```bash
   rustup target add aarch64-apple-darwin  # For Apple Silicon M1/M2/M3
   # or
   rustup target add x86_64-apple-darwin   # For Intel Macs
   ```

---

## 🪟 Windows Setup

1. **Install Build Tools**:
   Install the **C++ Build Tools** through the [Visual Studio Installer](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
2. **Install Rust**:
   Install Rust using the standard [rustup-init.exe installer](https://rustup.rs/).

---

## 🚀 Running and Compiling the Desktop App

Once the OS-specific prerequisites are configured, execute these commands in your terminal (macOS/Linux) or PowerShell/Command Prompt (Windows):

### 1. Install Node Dependencies
```bash
npm install
```

### 2. Run the Desktop App (Development Mode)
This starts the Vite local server and opens the live GBA Emulator Control Center desktop window.

**On Rocky/RHEL/CentOS Linux**:
```bash
PKG_CONFIG_PATH="$PWD/pkgconfig:$PKG_CONFIG_PATH" \
LIBRARY_PATH="$PWD/lib:$LIBRARY_PATH" \
LD_LIBRARY_PATH="$PWD/lib:$LD_LIBRARY_PATH" \
npm run tauri dev
```

*Note for VMs (VMware, VirtualBox, Proxmox)*: If you are running inside a virtual machine and see `libEGL warning` or `Permission denied` on `/dev/dri/card0`, disable WebKit hardware compositing to force stable CPU software rendering:
```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
PKG_CONFIG_PATH="$PWD/pkgconfig:$PKG_CONFIG_PATH" \
LIBRARY_PATH="$PWD/lib:$LIBRARY_PATH" \
LD_LIBRARY_PATH="$PWD/lib:$LD_LIBRARY_PATH" \
npm run tauri dev
```

**On Debian/Ubuntu Linux, macOS, or Windows**:
```bash
npm run tauri dev
```

### 3. Compile Production Desktop Installers
This compiles a highly optimized native binary for your target OS (under 15MB total).

**On Rocky/RHEL/CentOS Linux**:
```bash
PKG_CONFIG_PATH="$PWD/pkgconfig:$PKG_CONFIG_PATH" \
LIBRARY_PATH="$PWD/lib:$LIBRARY_PATH" \
LD_LIBRARY_PATH="$PWD/lib:$LD_LIBRARY_PATH" \
npm run tauri build
```

**On Debian/Ubuntu Linux, macOS, or Windows**:
```bash
npm run tauri build
```
The compiled installer will be saved under `src-tauri/target/release/bundle/` (e.g., as `.dmg` on macOS, `.msi` on Windows, or `.deb` / `.rpm` on Linux).
