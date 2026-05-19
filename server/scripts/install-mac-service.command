#!/bin/bash
# ─── AIO Presenter — Instalador del servidor local (macOS) ──────────────────
# Doble clic en Finder para instalar. Solo necesitas hacerlo UNA VEZ.
# El servidor se iniciará automáticamente cada vez que enciendas tu Mac.

set -e

PLIST_NAME="com.aiopresenter.local"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$HOME/Library/Logs/AIOPresenter"

# ── Directorios del servidor ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║        AIO Presenter — Servidor Local            ║"
echo "║             Instalación automática               ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "📂  Servidor detectado en: $SERVER_DIR"
echo ""

# ── Buscar Node.js ───────────────────────────────────────────────────────────
NODE_PATH=""
for candidate in \
    "$(which node 2>/dev/null)" \
    "/opt/homebrew/bin/node" \
    "/usr/local/bin/node" \
    "/usr/bin/node" \
    "$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin/node"
do
    if [ -x "$candidate" ]; then
        NODE_PATH="$candidate"
        break
    fi
done

if [ -z "$NODE_PATH" ]; then
    echo "❌  Node.js no encontrado."
    echo ""
    echo "    Instálalo desde: https://nodejs.org"
    echo "    (descarga la versión LTS)"
    echo ""
    read -p "Presiona Enter para cerrar..."
    exit 1
fi

echo "✅  Node.js: $NODE_PATH  ($(${NODE_PATH} --version))"

# ── Instalar dependencias si faltan ─────────────────────────────────────────
if [ ! -d "$SERVER_DIR/node_modules" ]; then
    echo ""
    echo "📦  Instalando dependencias del servidor (solo esta vez)…"
    NPM_PATH="$(dirname "$NODE_PATH")/npm"
    cd "$SERVER_DIR" && "$NPM_PATH" install --production --silent
    echo "✅  Dependencias instaladas"
fi

# ── Crear directorios necesarios ─────────────────────────────────────────────
mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# ── Construir el plist del LaunchAgent ───────────────────────────────────────
cat > "$PLIST_PATH" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${SERVER_DIR}/src/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${SERVER_DIR}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <!-- Iniciar automáticamente al hacer login -->
    <key>RunAtLoad</key>
    <true/>

    <!-- Reiniciar si el proceso cae -->
    <key>KeepAlive</key>
    <true/>

    <!-- Logs -->
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/server.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/server.error.log</string>

    <!-- Esperar 3 s entre reinicios para no ciclar si hay error -->
    <key>ThrottleInterval</key>
    <integer>3</integer>
</dict>
</plist>
PLIST_EOF

# ── Cargar (o recargar) el servicio ──────────────────────────────────────────
# macOS 13+: launchctl bootstrap / bootout
if launchctl print "gui/$(id -u)/$PLIST_NAME" &>/dev/null; then
    launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || \
    launchctl unload "$PLIST_PATH" 2>/dev/null
fi

launchctl load "$PLIST_PATH" 2>/dev/null || \
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || true

sleep 1

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          ✅  ¡Instalación completada!            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "🚀  El servidor AIO Presenter ahora:"
echo "    • Se inicia automáticamente al encender tu Mac"
echo "    • Se reinicia solo si cae"
echo ""
echo "📋  Logs en: $LOG_DIR"
echo ""
echo "    Para desinstalarlo: doble clic en uninstall-mac-service.command"
echo ""
read -p "Presiona Enter para cerrar…"
