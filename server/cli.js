#!/usr/bin/env node
'use strict';
/**
 * AIO Presenter — Punto de entrada del binario empaquetado (pkg)
 *
 * Modos de uso:
 *   ./aio-presenter-server               → primera vez: configura + instala servicio
 *   ./aio-presenter-server --run         → inicia el servidor (llamado por el servicio)
 *   ./aio-presenter-server --reinstall   → reinstala el servicio (útil al mover el binario)
 *   ./aio-presenter-server --uninstall   → elimina el servicio
 *   ./aio-presenter-server --status      → muestra si el servicio está activo
 */

const os   = require('os');
const fs   = require('fs');
const path = require('path');
const rl   = require('readline');
const { execSync, spawn } = require('child_process');

// ── Plataforma ────────────────────────────────────────────────────────────────
const isMac  = process.platform === 'darwin';
const isWin  = process.platform === 'win32';

// ── Rutas de configuración ────────────────────────────────────────────────────
const CONFIG_DIR  = isWin
  ? path.join(process.env.APPDATA || os.homedir(), 'AIOPresenter')
  : path.join(os.homedir(), '.aio-presenter');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.env');
const LOG_DIR     = isMac
  ? path.join(os.homedir(), 'Library', 'Logs', 'AIOPresenter')
  : path.join(CONFIG_DIR, 'logs');

// ── Ruta del binario en ejecución ─────────────────────────────────────────────
// process.pkg → true cuando estamos dentro de un binario generado por pkg
const BIN_PATH = process.pkg ? process.execPath : path.resolve(__filename);

// ── macOS LaunchAgent ─────────────────────────────────────────────────────────
const MAC_PLIST_NAME = 'com.aiopresenter.local';
const MAC_PLIST_PATH = path.join(
  os.homedir(), 'Library', 'LaunchAgents', `${MAC_PLIST_NAME}.plist`
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function banner(text) {
  const line = '═'.repeat(50);
  console.log(`\n╔${line}╗`);
  console.log(`║  ${text.padEnd(48)}║`);
  console.log(`╚${line}╝\n`);
}

function ask(question) {
  const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve =>
    iface.question(question, ans => { iface.close(); resolve(ans.trim()); })
  );
}

/** Carga las variables de entorno desde el archivo de configuración */
function loadConfig() {
  const candidates = [
    CONFIG_FILE,
    path.join(path.dirname(BIN_PATH), 'config.env'),
    path.join(path.dirname(BIN_PATH), '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0 && !line.startsWith('#')) {
          const k = line.slice(0, eq).trim();
          const v = line.slice(eq + 1).trim();
          if (k && !(k in process.env)) process.env[k] = v;
        }
      });
      return p;
    }
  }
  return null;
}

/** Guarda la configuración en CONFIG_FILE */
function saveConfig(values) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const lines = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(CONFIG_FILE, lines + '\n', 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Asistente de primera configuración
// ─────────────────────────────────────────────────────────────────────────────
async function runSetupWizard() {
  banner('AIO Presenter — Configuración inicial');

  console.log('Necesitas responder unas preguntas para conectar este');
  console.log('equipo a tu base de datos.\n');
  console.log('📋 Puedes encontrar estos datos en:');
  console.log('   aiopresenter.com → Configuración → Servidor local\n');

  const dbUrl = await ask('DATABASE_URL (pega la URL de tu base de datos): ');
  if (!dbUrl) { console.error('\n❌ La DATABASE_URL es obligatoria.'); process.exit(1); }

  const jwtRaw = await ask('JWT_SECRET (presiona Enter para generar uno automáticamente): ');
  const jwtSecret = jwtRaw ||
    require('crypto').randomBytes(32).toString('hex');

  const adminEmail = await ask('ADMIN_EMAIL (tu email de administrador): ');

  saveConfig({
    DATABASE_URL: dbUrl,
    JWT_SECRET:   jwtSecret,
    ADMIN_EMAIL:  adminEmail || '',
    PORT:         '3001',
  });

  // Recargar en proceso actual
  loadConfig();

  console.log(`\n✅ Configuración guardada en: ${CONFIG_FILE}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Instalación / desinstalación de servicio — macOS
// ─────────────────────────────────────────────────────────────────────────────
function installMac() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(MAC_PLIST_PATH), { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${MAC_PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${BIN_PATH}</string>
        <string>--run</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>3</integer>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/server.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/server.error.log</string>
</dict>
</plist>`;

  fs.writeFileSync(MAC_PLIST_PATH, plist, 'utf8');

  try {
    execSync(
      `launchctl bootout gui/$(id -u)/${MAC_PLIST_NAME} 2>/dev/null; ` +
      `launchctl load "${MAC_PLIST_PATH}"`,
      { shell: '/bin/bash', stdio: 'pipe' }
    );
  } catch { /* ignore if not previously loaded */ }

  console.log('✅ LaunchAgent instalado — el servidor se iniciará automáticamente al encender el Mac.');
  console.log(`📋 Logs en: ${LOG_DIR}`);
}

function uninstallMac() {
  try {
    execSync(
      `launchctl bootout gui/$(id -u)/${MAC_PLIST_NAME} 2>/dev/null; ` +
      `launchctl unload "${MAC_PLIST_PATH}" 2>/dev/null`,
      { shell: '/bin/bash', stdio: 'pipe' }
    );
  } catch { /* ignore */ }
  if (fs.existsSync(MAC_PLIST_PATH)) fs.unlinkSync(MAC_PLIST_PATH);
  console.log('✅ Servicio macOS eliminado.');
}

function statusMac() {
  const installed = fs.existsSync(MAC_PLIST_PATH);
  console.log(`LaunchAgent instalado : ${installed ? '✅ Sí' : '❌ No'}`);
  if (installed) {
    try {
      const out = execSync(
        `launchctl print gui/$(id -u)/${MAC_PLIST_NAME} 2>&1 | grep -E "state|pid"`,
        { shell: '/bin/bash', encoding: 'utf8' }
      );
      console.log(`Estado del servicio   :\n${out}`);
    } catch { console.log('Estado del servicio   : no disponible'); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instalación / desinstalación de servicio — Windows
// ─────────────────────────────────────────────────────────────────────────────
const WIN_RUN_KEY  = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const WIN_APP_NAME = 'AIOPresenterServer';

function installWin() {
  const cmd = `reg add "${WIN_RUN_KEY}" /v "${WIN_APP_NAME}" /t REG_SZ /d "${BIN_PATH} --run" /f`;
  try {
    execSync(cmd, { shell: 'cmd.exe', stdio: 'pipe' });
    console.log('✅ Registro de inicio automático agregado en Windows.');
    console.log('   El servidor arrancará con cada inicio de sesión.');
  } catch (e) {
    console.error('❌ No se pudo registrar el inicio automático:', e.message);
  }
}

function uninstallWin() {
  try {
    execSync(
      `reg delete "${WIN_RUN_KEY}" /v "${WIN_APP_NAME}" /f`,
      { shell: 'cmd.exe', stdio: 'pipe' }
    );
    console.log('✅ Inicio automático de Windows eliminado.');
  } catch { console.log('ℹ️  No había entrada de inicio automático.'); }
}

function statusWin() {
  try {
    const out = execSync(
      `reg query "${WIN_RUN_KEY}" /v "${WIN_APP_NAME}" 2>&1`,
      { shell: 'cmd.exe', encoding: 'utf8' }
    );
    console.log(out.includes(WIN_APP_NAME)
      ? '✅ Inicio automático registrado en Windows.'
      : '❌ No registrado.');
  } catch { console.log('❌ No registrado.'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // ── Modo --run: lo invoca el servicio del sistema (sin interacción) ─────────
  if (args.includes('--run')) {
    loadConfig();
    require('./src/index.js');
    return;
  }

  // ── Modo --uninstall ────────────────────────────────────────────────────────
  if (args.includes('--uninstall')) {
    banner('AIO Presenter — Desinstalar servicio');
    if (isMac) uninstallMac();
    if (isWin) uninstallWin();
    console.log('\nPuedes eliminar también el archivo de configuración:');
    console.log(` ${CONFIG_FILE}\n`);
    await ask('Presiona Enter para cerrar…');
    return;
  }

  // ── Modo --status ───────────────────────────────────────────────────────────
  if (args.includes('--status')) {
    banner('AIO Presenter — Estado del servicio');
    if (isMac) statusMac();
    if (isWin) statusWin();
    console.log(`\nConfiguración : ${CONFIG_FILE}`);
    return;
  }

  // ── Modo --reinstall: útil cuando se mueve el binario ──────────────────────
  if (args.includes('--reinstall')) {
    banner('AIO Presenter — Reinstalar servicio');
    loadConfig();
    if (isMac) { uninstallMac(); installMac(); }
    if (isWin) { uninstallWin(); installWin(); }
    await ask('\nPresiona Enter para cerrar…');
    return;
  }

  // ── Modo interactivo: primera instalación (doble clic) ─────────────────────
  banner('AIO Presenter — Servidor Local');
  console.log(`Sistema operativo : ${isMac ? 'macOS' : isWin ? 'Windows' : process.platform}`);
  console.log(`Binario           : ${BIN_PATH}\n`);

  // 1. Cargar o crear config
  const configPath = loadConfig();
  if (!configPath || !process.env.DATABASE_URL) {
    await runSetupWizard();
  } else {
    console.log(`✅ Configuración cargada desde: ${configPath}`);
    const change = await ask('¿Deseas cambiar la configuración? (s/N): ');
    if (/^s/i.test(change)) await runSetupWizard();
  }

  // 2. Instalar (o reinstalar) el servicio
  const alreadyInstalled = isMac
    ? fs.existsSync(MAC_PLIST_PATH)
    : false; // Windows siempre reinstala para actualizar la ruta

  if (alreadyInstalled) {
    console.log('\n🔄 El servicio ya estaba instalado. Actualizando…');
  } else {
    console.log('\n🔧 Instalando servicio de inicio automático…');
  }

  if (isMac) installMac();
  if (isWin) installWin();

  if (!isMac && !isWin) {
    console.log('⚠️  Sistema operativo no soportado para auto-inicio.');
    console.log('   Ejecuta manualmente: ./aio-presenter-server --run');
  }

  // 3. Resultado final
  banner('¡Instalación completada!');
  console.log('🚀 El servidor AIO Presenter ahora:');
  console.log('   • Se inicia automáticamente al encender este equipo');
  console.log('   • Se reinicia solo si falla');
  console.log('');
  console.log('Para desinstalar, ejecuta este mismo archivo con --uninstall');
  console.log('');

  await ask('Presiona Enter para cerrar…');
}

main().catch(err => {
  console.error('\n❌ Error inesperado:', err.message || err);
  process.exit(1);
});
