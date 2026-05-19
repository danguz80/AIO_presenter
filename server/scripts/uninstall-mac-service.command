#!/bin/bash
# ─── AIO Presenter — Desinstalador del servidor local (macOS) ───────────────

PLIST_NAME="com.aiopresenter.local"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       AIO Presenter — Desinstalar servicio       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

if [ ! -f "$PLIST_PATH" ]; then
    echo "ℹ️   El servicio no estaba instalado."
    echo ""
    read -p "Presiona Enter para cerrar…"
    exit 0
fi

launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || \
launchctl unload "$PLIST_PATH" 2>/dev/null || true

rm -f "$PLIST_PATH"

echo "✅  Servicio desinstalado."
echo "    El servidor ya NO se iniciará automáticamente."
echo ""
read -p "Presiona Enter para cerrar…"
