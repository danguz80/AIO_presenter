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
const mediaRouter  = require('./routes/media');
const eventsRouter          = require('./routes/events');
const eventTemplatesRouter  = require('./routes/eventTemplates');
const playsRouter           = require('./routes/plays');
const authRouter   = require('./routes/auth');
const syncRouter   = require('./routes/sync');
const ndi          = require('./ndi/ndiSender');

const app    = express();
const server = http.createServer(app);

// ─── CORS ───────────────────────────────────────────────────────────────────
// En producción sólo acepta el dominio oficial; en desarrollo acepta cualquier origen.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : true; // true = cualquier origen (dev)

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ─── SOCKET.IO ──────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

/**
 * Estado en memoria de la presentación en vivo.
 * En fases futuras esto puede persistirse en Redis o DB.
 */
let liveState = {
  type:            null,   // 'song' | 'bible' | 'blank' | null
  slideData:       null,   // datos del slide actual
  nextSlideData:   null,   // datos del siguiente slide (para pantalla de escenario)
  isBlank:         false,
  background:      { color: '#000000', type: 'color' },
  backgroundMedia: null,   // media en fondo (primerPlano=false) — persiste mientras no se blanquee
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
    await pool.query(`ALTER TABLE song_slides ADD COLUMN IF NOT EXISTS slide_background JSONB`);
    // Migraciones sync con Google Drive
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS drive_file_id  TEXT`);
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS drive_synced_at TIMESTAMPTZ`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sync_users (
        id              SERIAL PRIMARY KEY,
        google_id       TEXT UNIQUE NOT NULL,
        email           TEXT NOT NULL,
        display_name    TEXT,
        avatar_url      TEXT,
        is_admin        BOOLEAN DEFAULT FALSE,
        can_push        BOOLEAN DEFAULT FALSE,
        can_push_all    BOOLEAN DEFAULT FALSE,
        sync_direction  TEXT DEFAULT 'pull',
        drive_folder_id TEXT,
        last_sync_at    TIMESTAMPTZ,
        access_token    TEXT,
        refresh_token   TEXT,
        token_expiry    BIGINT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sync_invitations (
        id          SERIAL PRIMARY KEY,
        code        TEXT UNIQUE NOT NULL,
        label       TEXT,
        email       TEXT,
        can_push    BOOLEAN DEFAULT FALSE,
        can_push_all BOOLEAN DEFAULT FALSE,
        created_by  INT REFERENCES sync_users(id) ON DELETE SET NULL,
        used_by     INT REFERENCES sync_users(id) ON DELETE SET NULL,
        used_at     TIMESTAMPTZ,
        expires_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('stageConfig','stageTemplates','outputConfig','outputTemplates','virtualConfig','virtualTemplates','displayConfig','appTheme')"
    );
    for (const row of rows) {
      if (row.key === 'stageConfig')      { stageConfig    = { ...DEFAULT_STAGE_CONFIG, ...row.value }; console.log('[Settings] stageConfig cargado desde DB'); }
      if (row.key === 'stageTemplates')   { stageTemplates = row.value; }
      if (row.key === 'outputConfig')     { outputConfig   = { ...outputConfig, ...row.value };  console.log('[Settings] outputConfig cargado desde DB'); }
      if (row.key === 'outputTemplates')  { outputTemplates = Array.isArray(row.value) ? row.value : []; }
      if (row.key === 'virtualConfig')    { virtualConfig   = { ...virtualConfig, ...row.value }; console.log('[Settings] virtualConfig cargado desde DB'); }
      if (row.key === 'virtualTemplates') { virtualTemplates = Array.isArray(row.value) ? row.value : []; }
      if (row.key === 'displayConfig')    { displayConfig = { ...displayConfig, ...row.value }; console.log('[Settings] displayConfig cargado desde DB'); }
      if (row.key === 'appTheme')         { appTheme = typeof row.value === 'string' ? row.value : (row.value?.theme ?? 'oscuro'); console.log('[Settings] appTheme cargado:', appTheme); }
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

async function saveVirtualConfig() {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('virtualConfig', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(virtualConfig)]
    );
  } catch (e) {
    console.error('[Settings] Error guardando virtualConfig:', e.message);
  }
}

async function saveVirtualTemplates() {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('virtualTemplates', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(virtualTemplates)]
    );
  } catch (e) {
    console.error('[Settings] Error guardando virtualTemplates:', e.message);
  }
}

/** Configuración de la salida virtual / NDI */
let virtualConfig = {
  background:  { type: 'transparent' }, // 'transparent' | 'color' | 'chromakey'
  chromaColor: '#00b140',
  fontSize:    'auto',
  fontSizePx:  48,
  fontFamily:  'sans',
  fontBold:    false,
  fontItalic:  false,
  fontColor:   '#ffffff',
  fontStrokeWidth: 0,
  fontStrokeColor: '#000000',
  alignX:      'center', // 'left' | 'center' | 'right'
  alignY:      'center', // 'top'  | 'center' | 'bottom'
  textBg:         false,
  textBgColor:    '#000000',
  textBgOpacity:  0.5,
  textBgShape:    'rectangle', // 'rectangle' | 'rounded' | 'pill'
  textBgPadX:     24,
  textBgPadY:     12,
  ndiEnabled:  false,
  showComments: false,
  // Cita bíblica (referencia)
  bibleRefEnabled:   false,
  bibleRefFontSize:  24,
  bibleRefBgColor:   '#000000',
  bibleRefBgShape:   'rounded',
  bibleRefBgOpacity: 0.6,
  bibleRefPosition:  'bottom-right',
};

/** Tema de color de la UI */
let appTheme = 'oscuro';

async function saveAppTheme() {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('appTheme', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(appTheme)]
    );
  } catch (e) {
    console.error('[Settings] Error guardando appTheme:', e.message);
  }
}

/** Configuración de asignación de pantallas físicas */
let displayConfig = {
  principalScreenId:   null,  // id de pantalla asignada como Principal
  escenarioScreenId:   null,  // id de pantalla asignada como Escenario
  principalResolution: { width: 1920, height: 1080 },
  escenarioResolution: { width: 1920, height: 1080 },
  virtualResolution:   { width: 1920, height: 1080 },
  virtualOutputs:      [],    // [{ id, name, enabled }]
};

async function saveDisplayConfig() {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('displayConfig', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(displayConfig)]
    );
  } catch (e) {
    console.error('[Settings] Error guardando displayConfig:', e.message);
  }
}

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
  // Indicador de progreso de diapositivas
  progressEnabled:  false,
  progressPosition: 'bottom-right',
  progressSize:     14,
  progressColor:    '#ffffff',
  // Ajuste de fondo multimedia
  backgroundFit: 'contain',
  // Plantilla especial para Biblia
  bibleTemplateEnabled: false,
  bibleBackground:      null,
  bibleFontFamily:      'sans',
  bibleFontSize:        'auto',
  bibleColor:           '#ffffff',
  bibleAlignment:       'center',
  bibleAlignmentY:      'center',
  bibleRefPosition:     'bottom',
  bibleRefShowBg:       false,
  bibleRefBgColor:      '#000000',
  bibleRefBgOpacity:    0.6,
  bibleRefColor:        '#cccccc',
  bibleRefFontFamily:   'sans',
  bibleRefFontSize:     24,
  bibleVersionPosition: 'inline-right',
};
let outputTemplates = [];
let virtualTemplates = [];

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
  socket.emit('display:config',  displayConfig);
  socket.emit('app:theme',       appTheme);
  socket.emit('stage:config',    stageConfig);
  socket.emit('stage:templates', stageTemplates);
  socket.emit('virtual:config',  virtualConfig);
  socket.emit('output:config',   outputConfig);
  socket.emit('output:templates', outputTemplates);
  socket.emit('virtual:templates', virtualTemplates);
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
          songKey:          data.slideData?.songKey    || currentSong?.songKey    || null,
          titleSlideActive: true,
          slideIndex:       -1,
        };
      }
      // Fondo: usar el que manda el cliente (slideBackground), o el configurado en outputConfig
      const bgMedia = data.slideData?.slideBackground ?? outputConfig.titleBackground ?? null;
      liveState = { ...liveState, backgroundMedia: bgMedia, isBlank: false, slideData: data.slideData, nextSlideData: data.nextSlideData ?? null };
      ndi.updateState(liveState, virtualConfig);
      io.emit('live:state', liveState);
      return;
    }

    // Media de fondo (primerPlano=false): setear backgroundMedia sin cambiar el slide actual
    if (data.type === 'media' && data.slideData?.primerPlano === false) {
      liveState = { ...liveState, backgroundMedia: data.slideData, isBlank: false };
      ndi.updateState(liveState, virtualConfig);
      io.emit('live:state', liveState);
      return;
    }
    // Media en primer plano: limpiar backgroundMedia
    if (data.type === 'media') {
      liveState = { ...liveState, backgroundMedia: null };
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
          type:            'title',
          songTitle:       currentSong.songTitle,
          songAuthor:      currentSong.songAuthor,
          songId:          currentSong.songId,
          songKey:         currentSong.songKey || null,
          slideBackground: outputConfig.titleBackground || null,
        };
        const bgMedia = outputConfig.titleBackground || null;
        const nextSD = firstSlide ? { type: 'song', label: firstSlide.label, content: firstSlide.content } : null;
        liveState = { ...liveState, backgroundMedia: bgMedia, isBlank: false, slideData: titleSlideData, nextSlideData: nextSD, totalSlides: data.slides.length };
        ndi.updateState(liveState, virtualConfig);
        io.emit('live:state', liveState);
        return;
      }
    } else if (data.type !== 'song') {
      currentSong = null; // limpiar si se proyecta algo que no es canción
    }

    // Fondo ligado al slide de canción — solo sobreescribir si el slide TIENE fondo definido
    // Si no tiene, mantener el backgroundMedia anterior (heredar)
    if (data.type === 'song' && data.slideData?.slideBackground) {
      liveState = { ...liveState, backgroundMedia: data.slideData.slideBackground };
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
    if (isBlank) liveState.backgroundMedia = null; // blanquear limpia el fondo multimedia
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

  // Plantillas streaming/virtual
  socket.on('virtual:templates', (templates) => {
    virtualTemplates = Array.isArray(templates) ? templates : [];
    saveVirtualTemplates();
    io.emit('virtual:templates', virtualTemplates);
  });

  // Guardar tema de la UI
  socket.on('settings:theme', (theme) => {
    appTheme = String(theme);
    saveAppTheme();
    io.emit('app:theme', appTheme);
  });

  // Guardar configuración de pantallas físicas
  socket.on('settings:displays:save', (config) => {
    displayConfig = { ...displayConfig, ...config };
    saveDisplayConfig();
    io.emit('display:config', displayConfig);
  });

  // Actualizar configuración virtual / NDI
  socket.on('virtual:config', (config) => {
    virtualConfig = { ...virtualConfig, ...config };
    saveVirtualConfig();
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
          // Fondo: el del slide si tiene, si no limpiar (salimos del título)
          const bgMedia = slide.slide_background || null;
          liveState = {
            ...liveState,
            backgroundMedia: bgMedia,
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
          backgroundMedia: outputConfig.titleBackground || null,
          isBlank: false,
          slideData: { type: 'title', songTitle, songAuthor, songId, songKey: songKey || null },
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
      // Fondo: usar el del slide si tiene uno; si no, mantener el actual
      const bgMedia = slide.slide_background || liveState.backgroundMedia;
      liveState = {
        ...liveState,
        backgroundMedia: bgMedia,
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
app.use('/api/media',  mediaRouter);
app.use('/api/events',          eventsRouter);
app.use('/api/event-templates', eventTemplatesRouter);
app.use('/api/events',          playsRouter); // plays nested under /api/events/:id/plays
app.use('/auth',      authRouter);
app.use('/api/sync',  syncRouter);

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
