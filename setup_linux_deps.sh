#!/usr/bin/env bash
set -euo pipefail

echo "===================================================="
echo " GBA Emulator Dashboard Dependency Installer"
echo "===================================================="

# Detect Distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID=$ID
    OS_LIKE=${ID_LIKE:-""}
else
    echo "Error: Cannot detect OS distribution. Please install dependencies manually."
    exit 1
fi

echo "Detected OS: ${NAME} (${OS_ID})"

if [[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" || "$OS_LIKE" == *"debian"* || "$OS_LIKE" == *"ubuntu"* ]]; then
    echo "Configuring Debian/Ubuntu dependencies..."
    sudo apt update
    sudo apt install -y \
        libwebkit2gtk-4.1-dev \
        build-essential \
        curl \
        wget \
        file \
        libxdo-dev \
        libssl-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev
    echo "Debian/Ubuntu dependencies successfully installed!"

elif [[ "$OS_ID" == "rocky" || "$OS_ID" == "rhel" || "$OS_ID" == "centos" || "$OS_ID" == "fedora" || "$OS_LIKE" == *"rhel"* || "$OS_LIKE" == *"fedora"* ]]; then
    echo "Configuring RHEL/Rocky Linux dependencies..."
    
    # 1. Enable CRB if dnf config-manager is available
    if command -v dnf &> /dev/null; then
        echo "Enabling CodeReady Builder (CRB) repository..."
        sudo dnf config-manager --set-enabled crb || echo "CRB already active or configured."
        
        echo "Installing EPEL Release..."
        sudo dnf install -y epel-release
        
        echo "Refreshing DNF cache..."
        sudo dnf clean all
        sudo dnf makecache
        
        echo "Installing Development Group..."
        sudo dnf groupinstall -y "Development Tools"
        
        echo "Installing WebKit, GTK, LibSoup, and OpenSSL developer libraries..."
        sudo dnf install -y \
            webkit2gtk3-devel \
            libsoup-devel \
            gtk3-devel \
            glib2-devel \
            openssl-devel \
            pkgconf-pkg-config
            
        echo "Generating RHEL 9 local pkgconfig spoofing files..."
        mkdir -p pkgconfig
        
        # GLib Files
        cp /usr/lib64/pkgconfig/glib-2.0.pc pkgconfig/
        cp /usr/lib64/pkgconfig/gobject-2.0.pc pkgconfig/
        cp /usr/lib64/pkgconfig/gio-2.0.pc pkgconfig/
        cp /usr/lib64/pkgconfig/gmodule-2.0.pc pkgconfig/
        cp /usr/lib64/pkgconfig/gmodule-export-2.0.pc pkgconfig/
        cp /usr/lib64/pkgconfig/gmodule-no-export-2.0.pc pkgconfig/
        sed -i 's/Version: .*/Version: 2.70.0/g' pkgconfig/*.pc
        
        # LibSoup File
        cat << 'EOF' > pkgconfig/libsoup-3.0.pc
prefix=/usr
includedir=${prefix}/include
libdir=${prefix}/lib64
exec_prefix=${prefix}

Name: libsoup-3.0
Description: A glib-based HTTP library (Spoofed)
Version: 3.0.0
Requires: glib-2.0 >= 2.58, gobject-2.0 >= 2.58, gio-2.0 >= 2.58
Requires.private: sysprof-capture-4, libxml-2.0, sqlite3, libpsl >= 0.20, libbrotlidec, zlib
Libs: -L${libdir} -lsoup-2.4
Cflags: -I${includedir}/libsoup-2.4
EOF

        # JavaScriptCore File
        cat << 'EOF' > pkgconfig/javascriptcoregtk-4.1.pc
prefix=/usr
exec_prefix=${prefix}
libdir=/usr/lib64
includedir=${prefix}/include
revision=tarball

Name: JavaScriptCoreGTK+
Description: GTK+ version of the JavaScriptCore engine (Spoofed)
Version: 2.52.5
Requires: glib-2.0 gobject-2.0
Libs: -L${libdir} -ljavascriptcoregtk-4.0
Cflags: -I${includedir}/webkitgtk-4.0
EOF

        # WebKit File
        cat << 'EOF' > pkgconfig/webkit2gtk-4.1.pc
prefix=/usr
exec_prefix=${prefix}
libdir=/usr/lib64
includedir=${prefix}/include
revision=tarball

Name: WebKitGTK
Description: Web content engine for GTK (Spoofed)
Version: 2.52.5
Requires: glib-2.0 gtk+-3.0 libsoup-3.0 javascriptcoregtk-4.1
Libs: -L${libdir} -lwebkit2gtk-4.0
Cflags: -I${includedir}/webkitgtk-4.0
EOF
        
        echo "Generating RHEL 9 local library symlinks and linking stubs..."
        mkdir -p lib
        ln -sf /usr/lib64/libwebkit2gtk-4.0.so lib/libwebkit2gtk-4.1.so
        ln -sf /usr/lib64/libjavascriptcoregtk-4.0.so lib/libjavascriptcoregtk-4.1.so
        
        # Compile libsoup-3.0 stub and link to libsoup-2.4
        cat << 'EOF' > lib/libsoup3_stubs.c
void soup_message_headers_ref(void* h) {}
void soup_message_headers_unref(void* h) {}
EOF
        gcc -shared -fPIC -o lib/libsoup-3.0.so lib/libsoup3_stubs.c -L/usr/lib64 -lsoup-2.4
        rm -f lib/libsoup3_stubs.c
        
        echo "===================================================="
        echo " RHEL/Rocky Linux dependencies successfully installed!"
        echo " IMPORTANT: To run or compile the application, prefix"
        echo " your command with the local PKG_CONFIG_PATH and library paths:"
        echo ""
        echo "   PKG_CONFIG_PATH=\"\$PWD/pkgconfig:\$PKG_CONFIG_PATH\" \\"
        echo "   LIBRARY_PATH=\"\$PWD/lib:\$LIBRARY_PATH\" \\"
        echo "   LD_LIBRARY_PATH=\"\$PWD/lib:\$LD_LIBRARY_PATH\" \\"
        echo "   npm run tauri dev"
        echo ""
        echo "===================================================="
    else
        echo "Error: DNF packager not found. Please install dependencies manually."
        exit 1
    fi
else
    echo "Unsupported distribution: $OS_ID."
    echo "Please refer to README.md to install dependencies manually for your platform."
    exit 1
fi
