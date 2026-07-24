#!/bin/bash
# GBA Emulator CLI Control Script

# Detect workspace root
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

export PKG_CONFIG_PATH="$DIR/pkgconfig:$PKG_CONFIG_PATH"
export LIBRARY_PATH="$DIR/lib:$LIBRARY_PATH"
export LD_LIBRARY_PATH="$DIR/lib:$LD_LIBRARY_PATH"

ACTION=$1

if [ -z "$ACTION" ]; then
    echo "============================================="
    echo "  🎮 Game Boy Advance Emulator Dashboard CLI 🎮"
    echo "============================================="
    echo "Usage: ./run.sh [command]"
    echo ""
    echo "Commands:"
    echo "  dev       Launch the app in desktop development mode (hot-reloading)"
    echo "  build     Compile and package the production installer bundles"
    echo "  clean     Clean target compilation caches and build artifacts"
    echo "  help      Show this help information"
    echo "============================================="
    exit 0
fi

case "$ACTION" in
    dev)
        echo "🚀 Starting GBA Emulator in desktop development mode..."
        npm run dev
        ;;
    build)
        echo "📦 Compiling and building GBA Emulator production installers..."
        npm run build
        ;;
    clean)
        echo "🧹 Cleaning cargo cache & npm artifacts..."
        cargo clean --manifest-path "$DIR/src-tauri/Cargo.toml"
        echo "✅ Cleanup completed!"
        ;;
    help|--help|-h)
        $0
        ;;
    *)
        echo "❌ Unknown command: $ACTION"
        echo "Available commands: dev, build, clean"
        exit 1
        ;;
esac
