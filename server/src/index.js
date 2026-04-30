const os = require('os');

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const pool       = require('./config/database');

const songsRouter  = require('./routes/songs');
const bibleRouter  = require('./routes/bible');
const importRouter = require('./routes/import');
const eventsRouter = require('./routes/events');
const ndi          = require('./ndi/ndiSender');

const app    = express();
const server = http.createServer(app);

// ─── CORS ───────────────────────────────────────────────────────────────────
// Permitir cualquier origen de red local (móviles en la misma red WiFi)
app.use(cors({ origin: true, credentials: true }));

// ─── SOCKET.IO ──────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'] },
});

/**
 * Estado en memoria de la presentación en vivo.
 * En fases futuras esto puede persistirse en Redis o DB.
 */
let liveState = {
  type:          null,   // 'song' | 'bible' | 'blank' | null
  slideData:     null,   // datos del slide actual
  nextSlideData: null,   // datos del siguiente slide (para pantalla de escenario)
  isBlank:       false,
  background:    { color: '#000000', type: 'color' },
};

/** Configuración independiente de la pantalla de escenario */
const DEFAULT_STAGE_CONFIG = {
  background:       { type: 'color', color: '#1e1e2e' },
  showClock:        true,
  showNextSlide:    true,
  showSongTitle:    true,
  showSlideCounter: true,
  showSectionLabel: true,
  showSideLabel:    true,
  lyricsColor:      '#ffffff',
  nextLyricsColor:  '#ffffff',
  chordsColor:      '#fde047',
  clockColor:       '#ef4444',
  nextColor:        '#22c55e',
  fontSize:         'auto',
  fontFamily:       'sans',
  fontBold:         true,
  fontItalic:       false,
  customFonts:      [],
};

let stageConfig = { ...DEFAULT_STAGE_CONFIG };
let stageTemplates = [];

// Crear tabla settings si no existe y cargar stageConfig + templates persistidos
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key   VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL
      )
    `);
    // Migraciones: añadir columnas de metadatos a songs si no existen
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS song_key   VARCHAR(20)`);
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS bpm        INTEGER`);
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS time_sig   VARCHAR(20)`);
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS link       TEXT`);
    const { rows } = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('stageConfig','stageTemplates')"
    );
    for (const row of rows) {
      if (row.key === 'stageConfig')    { stageConfig    = { ...DEFAULT_STAGE_CONFIG, ...row.value }; console.log('[Settings] stageConfig cargado desde DB'); }
      if (row.key === 'stageTemplates') { stageTemplates = row.value; }
    }
  } catch (e) {
    console.error('[Settings] Error cargando settings desde DB:', e.message);
  }
})();

async function saveStageConfig() {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('stageConfig', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(stageConfig)]
    );
  } catch (e) {
    console.error('[Settings] Error guardando stageConfig:', e.message);
  }
}

async function saveStageTemplates() {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('stageTemplates', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(stageTemplates)]
    );
  } catch (e) {
    console.error('[Settings] Error guardando stageTemplates:', e.message);
  }
}

/** Configuración de la salida virtual / NDI */
let virtualConfig = {
  background:  { type: 'transparent' }, // 'transparent' | 'color' | 'chromakey'
  chromaColor: '#00b140',
  fontSize:    'auto',
  ndiEnabled:  false,
};

/** Slides de la canción activa para navegación server-side */
let currentSong = null; // { slides: [...], slideIndex: 0, songTitle: '' }

/** Lista de canciones del evento del día (para pantalla de escenario) */
let schedule = [];

// ─── NDI ─────────────────────────────────────────────────────────────────────
(async () => {
  const result = await ndi.init();
  if (result.ok) {
    ndi.updateState(liveState, virtualConfig);
  }
  // El status se difunde cuando los clientes se conectan
})();

io.on('connection', (socket) => {
  console.log(`[Socket] Cliente conectado: ${socket.id}`);

  // Enviar estado actual al cliente que se conecta
  socket.emit('live:state',      liveState);
  socket.emit('stage:config',    stageConfig);
  socket.emit('stage:templates', stageTemplates);
  socket.emit('virtual:config',  virtualConfig);
  socket.emit('ndi:status',      ndi.getStatus());
  socket.emit('schedule:update', schedule);

  // El operador envía un slide a proyectar
  socket.on('live:show', (data) => {
    // Guardar slides para navegación server-side (enviados por cualquier cliente)
    if (data.slides && Array.isArray(data.slides)) {
      currentSong = {
        slides:     data.slides,
        slideIndex: data.slideIndex ?? 0,
        songTitle:  data.slideData?.songTitle || '',
        songId:     data.slideData?.songId   || null,
      };
    } else if (data.type !== 'song') {
      currentSong = null; // limpiar si se proyecta algo que no es canción
    }
    // No persistir el array completo de slides (demasiado grande), pero sí el índice y total
    const { slides, ...rest } = data;
    liveState = { ...liveState, ...rest, totalSlides: slides?.length ?? null, isBlank: false };
    ndi.updateState(liveState, virtualConfig);
    io.emit('live:state', liveState);
  });

  // Pantalla en negro / en blanco
  socket.on('live:blank', (isBlank) => {
    liveState.isBlank = isBlank;
    ndi.updateState(liveState, virtualConfig);
    io.emit('live:state', liveState);
  });

  // Cambiar fondo (pantalla principal)
  socket.on('live:background', (bg) => {
    liveState.background = bg;
    io.emit('live:state', liveState);
  });

  // Actualizar plantillas de escenario
  socket.on('stage:templates', (templates) => {
    stageTemplates = Array.isArray(templates) ? templates : [];
    saveStageTemplates();
    io.emit('stage:templates', stageTemplates);
  });

  // Actualizar lista del evento del día
  socket.on('schedule:update', (songs) => {
    schedule = Array.isArray(songs) ? songs : [];
    io.emit('schedule:update', schedule);
  });

  // Actualizar configuración de la pantalla de escenario
  socket.on('stage:config', (config) => {
    stageConfig = { ...stageConfig, ...config };
    saveStageConfig();
    io.emit('stage:config', stageConfig);
  });

  // Actualizar configuración virtual / NDI
  socket.on('virtual:config', (config) => {
    virtualConfig = { ...virtualConfig, ...config };
    ndi.updateState(liveState, virtualConfig);

    // Activar / desactivar emisión NDI
    if (virtualConfig.ndiEnabled) {
      ndi.start();
    } else {
      ndi.stop();
    }

    io.emit('virtual:config', virtualConfig);
    io.emit('ndi:status', ndi.getStatus());
  });

  // Navegar: el móvil u otro cliente pide avanzar/retroceder
  socket.on('navigate', (dir) => {
    // Si hay una canción activa, el servidor calcula el siguiente slide
    if (currentSong && currentSong.slides.length > 0) {
      const { slides, songId, slideIndex, songTitle } = currentSong;
      const newIndex = dir === 'next'
        ? Math.min(slideIndex + 1, slides.length - 1)
        : Math.max(slideIndex - 1, 0);
      if (newIndex === slideIndex) return;
      currentSong.slideIndex = newIndex;
      const slide     = slides[newIndex];
      const nextSlide = slides[newIndex + 1] || null;
      liveState = {
        ...liveState,
        isBlank:       false,
        slideData: {
          type:      'song',
          songId,
          slideId:   slide.id,
          songTitle,
          label:     slide.label,
          content:   slide.content,
        },
        nextSlideData: nextSlide ? { type: 'song', label: nextSlide.label, content: nextSlide.content } : null,
      };
      ndi.updateState(liveState, virtualConfig);
      io.emit('live:state', liveState); // actualiza TODOS los clientes
    } else {
      // Sin canción activa (ej. Biblia): re-emitir para que los clientes naveguen
      socket.broadcast.emit('navigate', dir);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Cliente desconectado: ${socket.id}`);
  });
});

// ─── MIDDLEWARES ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── RUTAS ───────────────────────────────────────────────────────────────────
app.use('/api/songs',  songsRouter);
app.use('/api/bible',  bibleRouter);
app.use('/api/import', importRouter);
app.use('/api/events', eventsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Devuelve la IP local de la máquina para mostrar en el QR
app.get('/api/network-info', (_req, res) => {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  const port = process.env.PORT || 3001;
  res.json({ ips, port });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ─── START ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🎬  AIO Presenter Server corriendo en http://localhost:${PORT}`);
  console.log(`   WebSocket activo en ws://localhost:${PORT}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Puerto ${PORT} en uso. Esperando 2s y reintentando...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, 2000);
  } else {
    throw err;
  }
});
