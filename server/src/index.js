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
const eventsRouter          = require('./routes/events');
const eventTemplatesRouter  = require('./routes/eventTemplates');
const playsRouter           = require('./routes/plays');
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
  fontFamilyTitle:  'sans',
  fontBold:         true,
  fontItalic:       false,
  fontStrokeWidth:  0,
  fontStrokeColor:  '#000000',
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
      "SELECT key, value FROM app_settings WHERE key IN ('stageConfig','stageTemplates','outputConfig','outputTemplates')"
    );
    for (const row of rows) {
      if (row.key === 'stageConfig')      { stageConfig    = { ...DEFAULT_STAGE_CONFIG, ...row.value }; console.log('[Settings] stageConfig cargado desde DB'); }
      if (row.key === 'stageTemplates')   { stageTemplates = row.value; }
      if (row.key === 'outputConfig')     { outputConfig   = { ...outputConfig, ...row.value };  console.log('[Settings] outputConfig cargado desde DB'); }
      if (row.key === 'outputTemplates')  { outputTemplates = Array.isArray(row.value) ? row.value : []; }
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

async function saveOutputConfig() {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('outputConfig', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(outputConfig)]
    );
  } catch (e) {
    console.error('[Settings] Error guardando outputConfig:', e.message);
  }
}

async function saveOutputTemplates() {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('outputTemplates', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(outputTemplates)]
    );
  } catch (e) {
    console.error('[Settings] Error guardando outputTemplates:', e.message);
  }
}

/** Configuración de la salida virtual / NDI */
let virtualConfig = {
  background:  { type: 'transparent' }, // 'transparent' | 'color' | 'chromakey'
  chromaColor: '#00b140',
  fontSize:    'auto',
  ndiEnabled:  false,
  showComments: false,
};

/** Configuración de la salida principal (proyector) */
let outputConfig = {
  lyricsColor:      '#ffffff',
  fontFamily:       'sans',
  fontBold:         false,
  fontItalic:       false,
  fontSize:         'auto',
  fontStrokeWidth:  0,
  fontStrokeColor:  '#000000',
  showLabel:        true,
  showSongTitle:    true,
  showComments:      false,
  commentColor:      '#facc15',
  commentFontSize:   16,
  commentFontFamily: 'sans',
  // Diapositiva de título
  titleSlideEnabled:  false,
  titleFontFamily:    'sans',
  titleFontSize:      72,
  titleColor:         '#ffffff',
  titleShowArtist:    false,
  artistFontFamily:   'sans',
  artistFontSize:     36,
  artistColor:        '#aaaaaa',
};
let outputTemplates = [];

/** Slides de la canción activa para navegación server-side */
let currentSong = null; // { slides, slideIndex, songTitle, songAuthor, songId, songKey, titleSlideActive }

/** Lista de canciones del evento del día (para pantalla de escenario) */
let schedule = [];

/** Canciones ya tocadas en el evento activo (para todas las pantallas) */
let eventPlays = { ids: [], ctx: null };

/** Modo reservas activo */
let reservasMode = false;

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
  socket.emit('output:config',   outputConfig);
  socket.emit('output:templates', outputTemplates);
  socket.emit('ndi:status',      ndi.getStatus());
  socket.emit('schedule:update', schedule);
  if (eventPlays.ids.length > 0) socket.emit('event:plays', eventPlays);
  socket.emit('event:reservas_mode', reservasMode);

  // El operador envía un slide a proyectar
  socket.on('live:show', (data) => {
    // Clic directo en el thumbnail de título desde el grid — no re-evalúa isNewSong
    if (data.type === 'title-direct') {
      if (data.slides && Array.isArray(data.slides)) {
        currentSong = {
          ...currentSong,
          slides:           data.slides,
          songTitle:        data.slideData?.songTitle  || currentSong?.songTitle  || '',
          songAuthor:       data.slideData?.songAuthor || currentSong?.songAuthor || '',
          songId:           data.slideData?.songId     || currentSong?.songId     || null,
          titleSlideActive: true,
          slideIndex:       -1,
        };
      }
      liveState = { ...liveState, isBlank: false, slideData: data.slideData, nextSlideData: data.nextSlideData ?? null };
      ndi.updateState(liveState, virtualConfig);
      io.emit('live:state', liveState);
      return;
    }

    // Guardar slides para navegación server-side (enviados por cualquier cliente)
    if (data.slides && Array.isArray(data.slides)) {
      const isNewSong = !currentSong || currentSong.songId !== (data.slideData?.songId ?? null);
      currentSong = {
        slides:           data.slides,
        slideIndex:       data.slideIndex ?? 0,
        songTitle:        data.slideData?.songTitle  || '',
        songAuthor:       data.slideData?.songAuthor || '',
        songId:           data.slideData?.songId     || null,
        songKey:          data.slideData?.songKey    || null,
        titleSlideActive: false,
      };
      // Mostrar diapositiva de título al cargar una canción nueva con la opción habilitada
      if (outputConfig.titleSlideEnabled && isNewSong) {
        currentSong.titleSlideActive = true;
        currentSong.slideIndex = -1; // posición especial: antes del primer slide
        const firstSlide = data.slides[0];
        const titleSlideData = {
          type:       'title',
          songTitle:  currentSong.songTitle,
          songAuthor: currentSong.songAuthor,
          songId:     currentSong.songId,
        };
        const nextSD = firstSlide ? { type: 'song', label: firstSlide.label, content: firstSlide.content } : null;
        liveState = { ...liveState, isBlank: false, slideData: titleSlideData, nextSlideData: nextSD, totalSlides: data.slides.length };
        ndi.updateState(liveState, virtualConfig);
        io.emit('live:state', liveState);
        return;
      }
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

  // Sincronizar canciones tocadas entre todas las ventanas
  socket.on('event:plays', (data) => {
    eventPlays = data;
    io.emit('event:plays', data);
  });

  // Sincronizar modo reservas entre todas las ventanas
  socket.on('event:reservas_mode', (mode) => {
    reservasMode = mode;
    io.emit('event:reservas_mode', mode);
  });

  // Actualizar configuración de la pantalla de escenario
  socket.on('stage:config', (config) => {
    stageConfig = { ...stageConfig, ...config };
    saveStageConfig();
    io.emit('stage:config', stageConfig);
  });

  // Actualizar configuración de la salida principal
  socket.on('output:config', (config) => {
    outputConfig = { ...outputConfig, ...config };
    saveOutputConfig();
    io.emit('output:config', outputConfig);
  });

  // Plantillas de la salida principal
  socket.on('output:templates', (templates) => {
    outputTemplates = Array.isArray(templates) ? templates : [];
    saveOutputTemplates();
    io.emit('output:templates', outputTemplates);
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
      const { slides, songId, songTitle, songAuthor, songKey } = currentSong;

      // Si estamos en la diapositiva de título
      if (currentSong.titleSlideActive) {
        if (dir === 'next') {
          currentSong.titleSlideActive = false;
          currentSong.slideIndex = 0;
          const slide     = slides[0];
          const nextSlide = slides[1] || null;
          liveState = {
            ...liveState,
            isBlank: false,
            slideData: { type: 'song', songId, slideId: slide.id, songTitle, songKey: songKey || null, label: slide.label, content: slide.content },
            nextSlideData: nextSlide ? { type: 'song', label: nextSlide.label, content: nextSlide.content } : null,
          };
          ndi.updateState(liveState, virtualConfig);
          io.emit('live:state', liveState);
        }
        // 'prev' en título no hace nada
        return;
      }

      const { slideIndex } = currentSong;
      const newIndex = dir === 'next'
        ? Math.min(slideIndex + 1, slides.length - 1)
        : Math.max(slideIndex - 1, 0);

      // Si volvemos al inicio y la diapositiva de título está habilitada
      if (dir === 'prev' && slideIndex === 0 && outputConfig.titleSlideEnabled) {
        currentSong.titleSlideActive = true;
        currentSong.slideIndex = -1;
        liveState = {
          ...liveState,
          isBlank: false,
          slideData: { type: 'title', songTitle, songAuthor, songId },
          nextSlideData: { type: 'song', label: slides[0].label, content: slides[0].content },
        };
        ndi.updateState(liveState, virtualConfig);
        io.emit('live:state', liveState);
        return;
      }

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
          songKey:   songKey || null,
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
app.use('/api/events',          eventsRouter);
app.use('/api/event-templates', eventTemplatesRouter);
app.use('/api/events',          playsRouter); // plays nested under /api/events/:id/plays

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
