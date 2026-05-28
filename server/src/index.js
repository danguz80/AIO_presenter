const os = require('os');
const jwt = require('jsonwebtoken');

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const pool       = require('./config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'aio-presenter-secret-change-me';

const songsRouter  = require('./routes/songs');
const bibleRouter  = require('./routes/bible');
const importRouter = require('./routes/import');
const mediaRouter  = require('./routes/media');
const eventsRouter          = require('./routes/events');
const eventTemplatesRouter  = require('./routes/eventTemplates');
const playsRouter           = require('./routes/plays');
const authRouter   = require('./routes/auth');
const syncRouter   = require('./routes/sync');
const bandConfigsRouter  = require('./routes/bandConfigs');
const blockedDatesRouter = require('./routes/blockedDates');
const notificationsRouter = require('./routes/notifications');
const ndi          = require('./ndi/ndiSender');

const app    = express();
const server = http.createServer(app);

// ─── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : true;

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ─── SOCKET.IO ──────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

// Exponer io globalmente para controladores (publish event → notificaciones)
app.set('io', io);

// ─── Estado por organización ─────────────────────────────────────────────────
const orgStates = new Map(); // orgId → state object

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

function defaultOrgState() {
  return {
    liveState: {
      type: null, slideData: null, nextSlideData: null, isBlank: false,
      background: { color: '#000000', type: 'color' }, backgroundMedia: null,
    },
    stageConfig: { ...DEFAULT_STAGE_CONFIG },
    stageTemplates: [],
    outputConfig: {
      lyricsColor: '#ffffff', fontFamily: 'sans', fontBold: false, fontItalic: false,
      fontSize: 'auto', fontStrokeWidth: 0, fontStrokeColor: '#000000',
      showLabel: true, showSongTitle: true, showComments: false,
      commentColor: '#facc15', commentFontSize: 16, commentFontFamily: 'sans',
      titleSlideEnabled: false, titleFontFamily: 'sans', titleFontSize: 72,
      titleColor: '#ffffff', titleShowArtist: false, artistFontFamily: 'sans',
      artistFontSize: 36, artistColor: '#aaaaaa',
      progressEnabled: false, progressPosition: 'bottom-right', progressSize: 14, progressColor: '#ffffff',
      backgroundFit: 'contain',
      bibleTemplateEnabled: false, bibleBackground: null, bibleFontFamily: 'sans',
      bibleFontSize: 'auto', bibleColor: '#ffffff', bibleAlignment: 'center',
      bibleAlignmentY: 'center', bibleRefPosition: 'bottom', bibleRefShowBg: false,
      bibleRefBgColor: '#000000', bibleRefBgOpacity: 0.6, bibleRefColor: '#cccccc',
      bibleRefFontFamily: 'sans', bibleRefFontSize: 24, bibleVersionPosition: 'inline-right',
    },
    outputTemplates: [],
    virtualConfig: {
      background: { type: 'transparent' }, chromaColor: '#00b140',
      fontSize: 'auto', fontSizePx: 48, fontFamily: 'sans', fontBold: false, fontItalic: false,
      fontColor: '#ffffff', fontStrokeWidth: 0, fontStrokeColor: '#000000',
      alignX: 'center', alignY: 'center', textBg: false, textBgColor: '#000000',
      textBgOpacity: 0.5, textBgShape: 'rectangle', textBgPadX: 24, textBgPadY: 12,
      ndiEnabled: false, showComments: false,
      bibleRefEnabled: false, bibleRefFontSize: 24, bibleRefBgColor: '#000000',
      bibleRefBgShape: 'rounded', bibleRefBgOpacity: 0.6, bibleRefPosition: 'bottom-right',
    },
    virtualTemplates: [],
    appTheme: 'oscuro',
    displayConfig: {
      principalScreenId: null, escenarioScreenId: null,
      principalResolution: { width: 1920, height: 1080 },
      escenarioResolution: { width: 1920, height: 1080 },
      virtualResolution: { width: 1920, height: 1080 },
      virtualOutputs: [],
    },
    currentSong: null,
    schedule: [],
    eventPlays: { ids: [], ctx: null },
    reservasMode: false,
  };
}

function getOrgState(orgId) {
  if (!orgStates.has(orgId)) {
    orgStates.set(orgId, defaultOrgState());
  }
  return orgStates.get(orgId);
}

async function saveOrgSetting(orgId, key, value) {
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [`${orgId}:${key}`, JSON.stringify(value)]
    );
  } catch (e) {
    console.error(`[Settings] Error guardando ${orgId}:${key}:`, e.message);
  }
}

// Crear tabla settings si no existe y cargar estados por org desde DB
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key   VARCHAR(150) PRIMARY KEY,
        value JSONB NOT NULL
      )
    `);
    // Migraciones: añadir columnas de metadatos a songs si no existen
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS song_key   VARCHAR(20)`);
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS bpm        INTEGER`);
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS time_sig   VARCHAR(20)`);
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS link       TEXT`);
    await pool.query(`ALTER TABLE song_slides ADD COLUMN IF NOT EXISTS slide_background JSONB`);
    // ─── Multi-tenant: tabla organizations ───────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        plan       VARCHAR(20) DEFAULT 'trial',
        trial_ends DATE DEFAULT (CURRENT_DATE + 7),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // sync_users y sync_invitations deben crearse ANTES de los ALTER TABLE que los referencian
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
    await pool.query(`ALTER TABLE sync_users      ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)`);
    await pool.query(`ALTER TABLE songs           ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)`);
    await pool.query(`ALTER TABLE events          ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)`);
    await pool.query(`ALTER TABLE sync_invitations ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)`);
    // Membresías usuario ↔ organización (muchos a muchos)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_organizations (
        user_id         INTEGER NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        role            VARCHAR(20) NOT NULL DEFAULT 'member',
        joined_at       TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, organization_id)
      )
    `);
    // Poblar user_organizations desde sync_users.organization_id (migración)
    await pool.query(`
      INSERT INTO user_organizations (user_id, organization_id, role)
      SELECT id, organization_id,
             CASE WHEN is_admin THEN 'admin' ELSE 'member' END
      FROM sync_users
      WHERE organization_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
    // Carpetas multimedia por organización
    await pool.query(`
      CREATE TABLE IF NOT EXISTS media_folders (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Campos multimedia en ítems de eventos
    await pool.query(`ALTER TABLE event_songs ADD COLUMN IF NOT EXISTS media_name TEXT`);
    await pool.query(`ALTER TABLE event_songs ADD COLUMN IF NOT EXISTS media_type TEXT`);
    // Migraciones sync con Google Drive
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS drive_file_id  TEXT`);
    await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS drive_synced_at TIMESTAMPTZ`);
    // ─── Cancionero: instrumentos, configuraciones de banda, fechas bloqueadas ─
    await pool.query(`ALTER TABLE sync_users ADD COLUMN IF NOT EXISTS instruments TEXT[] DEFAULT '{}'`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS band_configs (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
        name            VARCHAR(100) NOT NULL,
        slots           JSONB DEFAULT '[]',
        position        INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_blocked_dates (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER REFERENCES sync_users(id) ON DELETE CASCADE,
        organization_id INTEGER REFERENCES organizations(id),
        date            DATE NOT NULL,
        reason          TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, date)
      )
    `);
    // ─── Nombre de banda por organización ─────────────────────────────────
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS band_name VARCHAR(100)`);
    // ─── Publicación de eventos ────────────────────────────────────────────
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`);
    // ─── Notificaciones in-app ─────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER REFERENCES sync_users(id) ON DELETE CASCADE,
        organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
        type            VARCHAR(50) NOT NULL DEFAULT 'event_published',
        title           TEXT NOT NULL,
        body            TEXT,
        metadata        JSONB DEFAULT '{}',
        is_read         BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await pool.query("SELECT key, value FROM app_settings");
    for (const row of rows) {
      const colonIdx = row.key.indexOf(':');
      if (colonIdx === -1) continue; // clave de formato antiguo, ignorar
      const orgId = parseInt(row.key.slice(0, colonIdx), 10);
      if (isNaN(orgId)) continue;
      const settingKey = row.key.slice(colonIdx + 1);
      const s = getOrgState(orgId);
      if (settingKey === 'stageConfig')      s.stageConfig    = { ...s.stageConfig,    ...row.value };
      if (settingKey === 'stageTemplates')   s.stageTemplates = Array.isArray(row.value) ? row.value : [];
      if (settingKey === 'outputConfig')     s.outputConfig   = { ...s.outputConfig,   ...row.value };
      if (settingKey === 'outputTemplates')  s.outputTemplates = Array.isArray(row.value) ? row.value : [];
      if (settingKey === 'virtualConfig')    s.virtualConfig  = { ...s.virtualConfig,  ...row.value };
      if (settingKey === 'virtualTemplates') s.virtualTemplates = Array.isArray(row.value) ? row.value : [];
      if (settingKey === 'displayConfig')    s.displayConfig  = { ...s.displayConfig,  ...row.value };
      if (settingKey === 'appTheme')         s.appTheme = typeof row.value === 'string' ? row.value : (row.value?.theme ?? 'oscuro');
    }
    console.log('[Settings] Estados por org cargados desde DB');
  } catch (e) {
    console.error('[Settings] Error cargando settings desde DB:', e?.message || e);
  }
})();

// ─── NDI ─────────────────────────────────────────────────────────────────────
(async () => {
  const result = await ndi.init();
  if (result.ok) {
    // NDI usa el estado del org 1 por defecto hasta que haya org activa
    const s = getOrgState(1);
    ndi.updateState(s.liveState, s.virtualConfig);
  }
})();

// ─── SOCKET.IO AUTH MIDDLEWARE ───────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const fallbackOrgId = socket.handshake.auth?.orgId
    ? parseInt(socket.handshake.auth.orgId, 10)
    : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      // Si el JWT lleva orgId válido y coincide con el usuario en DB, usarlo directamente
      // Si no (ej. JWT emitido antes de asignar org), consultar DB para obtener el org real
      if (decoded.orgId) {
        socket.orgId = decoded.orgId;
        return next();
      }
      // JWT sin orgId → buscar en DB
      pool.query('SELECT organization_id FROM sync_users WHERE id = $1', [decoded.userId])
        .then(({ rows }) => {
          socket.orgId = rows[0]?.organization_id ?? null;
          return next();
        })
        .catch(() => next(new Error('Error verificando organización')));
      return;
    } catch {
      // token inválido — intentar con fallbackOrgId
    }
  }
  // Permitir conexión sin token si proveen orgId (para pantallas de salida/escenario)
  if (fallbackOrgId) {
    socket.orgId  = fallbackOrgId;
    socket.userId = null;
    return next();
  }
  // Sin auth → desconectar
  return next(new Error('Sin autenticación. Proporciona un token o orgId.'));
});

io.on('connection', (socket) => {
  const orgId = socket.orgId;
  socket.join(`org:${orgId}`);
  console.log(`[Socket] Org ${orgId} — cliente conectado: ${socket.id}`);

  const s = getOrgState(orgId);

  const emitToOrg = (event, data) => io.to(`org:${orgId}`).emit(event, data);

  // Enviar estado actual al cliente que se conecta
  socket.emit('live:state',        s.liveState);
  socket.emit('display:config',    s.displayConfig);
  socket.emit('app:theme',         s.appTheme);
  socket.emit('stage:config',      s.stageConfig);
  socket.emit('stage:templates',   s.stageTemplates);
  socket.emit('virtual:config',    s.virtualConfig);
  socket.emit('output:config',     s.outputConfig);
  socket.emit('output:templates',  s.outputTemplates);
  socket.emit('virtual:templates', s.virtualTemplates);
  socket.emit('ndi:status',        ndi.getStatus());
  socket.emit('schedule:update',   s.schedule);
  if (s.eventPlays.ids.length > 0) socket.emit('event:plays', s.eventPlays);
  socket.emit('event:reservas_mode', s.reservasMode);

  // El operador envía un slide a proyectar
  socket.on('live:show', (data) => {
    // Clic directo en el thumbnail de título desde el grid — no re-evalúa isNewSong
    if (data.type === 'title-direct') {
      if (data.slides && Array.isArray(data.slides)) {
        s.currentSong = {
          ...s.currentSong,
          slides:           data.slides,
          songTitle:        data.slideData?.songTitle  || s.currentSong?.songTitle  || '',
          songAuthor:       data.slideData?.songAuthor || s.currentSong?.songAuthor || '',
          songId:           data.slideData?.songId     || s.currentSong?.songId     || null,
          songKey:          data.slideData?.songKey    || s.currentSong?.songKey    || null,
          titleSlideActive: true,
          slideIndex:       -1,
        };
      }
      const bgMedia = data.slideData?.slideBackground ?? s.outputConfig.titleBackground ?? null;
      s.liveState = { ...s.liveState, backgroundMedia: bgMedia, isBlank: false, slideData: data.slideData, nextSlideData: data.nextSlideData ?? null };
      ndi.updateState(s.liveState, s.virtualConfig);
      emitToOrg('live:state', s.liveState);
      return;
    }

    // Media de fondo (primerPlano=false)
    if (data.type === 'media' && data.slideData?.primerPlano === false) {
      s.liveState = { ...s.liveState, backgroundMedia: data.slideData, isBlank: false };
      ndi.updateState(s.liveState, s.virtualConfig);
      emitToOrg('live:state', s.liveState);
      return;
    }
    if (data.type === 'media') {
      s.liveState = { ...s.liveState, backgroundMedia: null };
    }

    if (data.slides && Array.isArray(data.slides)) {
      const isNewSong = !s.currentSong || s.currentSong.songId !== (data.slideData?.songId ?? null);
      s.currentSong = {
        slides:           data.slides,
        slideIndex:       data.slideIndex ?? 0,
        songTitle:        data.slideData?.songTitle  || '',
        songAuthor:       data.slideData?.songAuthor || '',
        songId:           data.slideData?.songId     || null,
        songKey:          data.slideData?.songKey    || null,
        titleSlideActive: false,
      };
      if (s.outputConfig.titleSlideEnabled && isNewSong) {
        s.currentSong.titleSlideActive = true;
        s.currentSong.slideIndex = -1;
        const firstSlide = data.slides[0];
        const titleSlideData = {
          type: 'title',
          songTitle:  s.currentSong.songTitle,
          songAuthor: s.currentSong.songAuthor,
          songId:     s.currentSong.songId,
          songKey:    s.currentSong.songKey || null,
          slideBackground: s.outputConfig.titleBackground || null,
        };
        const bgMedia = s.outputConfig.titleBackground || null;
        const nextSD = firstSlide ? { type: 'song', label: firstSlide.label, content: firstSlide.content } : null;
        s.liveState = { ...s.liveState, backgroundMedia: bgMedia, isBlank: false, slideData: titleSlideData, nextSlideData: nextSD, totalSlides: data.slides.length };
        ndi.updateState(s.liveState, s.virtualConfig);
        emitToOrg('live:state', s.liveState);
        return;
      }
    } else if (data.type !== 'song') {
      s.currentSong = null;
    }

    if (data.type === 'song' && data.slideData?.slideBackground) {
      s.liveState = { ...s.liveState, backgroundMedia: data.slideData.slideBackground };
    }
    const { slides, ...rest } = data;
    s.liveState = { ...s.liveState, ...rest, totalSlides: slides?.length ?? null, isBlank: false };
    ndi.updateState(s.liveState, s.virtualConfig);
    emitToOrg('live:state', s.liveState);
  });

  // Pantalla en negro / en blanco
  socket.on('live:blank', (isBlank) => {
    s.liveState.isBlank = isBlank;
    if (isBlank) s.liveState.backgroundMedia = null;
    ndi.updateState(s.liveState, s.virtualConfig);
    emitToOrg('live:state', s.liveState);
  });

  // Cambiar fondo (pantalla principal)
  socket.on('live:background', (bg) => {
    s.liveState.background = bg;
    emitToOrg('live:state', s.liveState);
  });

  // Actualizar plantillas de escenario
  socket.on('stage:templates', (templates) => {
    s.stageTemplates = Array.isArray(templates) ? templates : [];
    saveOrgSetting(orgId, 'stageTemplates', s.stageTemplates);
    emitToOrg('stage:templates', s.stageTemplates);
  });

  // Actualizar lista del evento del día
  socket.on('schedule:update', (songs) => {
    s.schedule = Array.isArray(songs) ? songs : [];
    emitToOrg('schedule:update', s.schedule);
  });

  // Sincronizar canciones tocadas
  socket.on('event:plays', (data) => {
    s.eventPlays = data;
    emitToOrg('event:plays', data);
  });

  // Sincronizar modo reservas
  socket.on('event:reservas_mode', (mode) => {
    s.reservasMode = mode;
    emitToOrg('event:reservas_mode', mode);
  });

  // Actualizar configuración de pantalla de escenario
  socket.on('stage:config', (config) => {
    s.stageConfig = { ...s.stageConfig, ...config };
    saveOrgSetting(orgId, 'stageConfig', s.stageConfig);
    emitToOrg('stage:config', s.stageConfig);
  });

  // Actualizar configuración de salida principal
  socket.on('output:config', (config) => {
    s.outputConfig = { ...s.outputConfig, ...config };
    saveOrgSetting(orgId, 'outputConfig', s.outputConfig);
    emitToOrg('output:config', s.outputConfig);
  });

  // Plantillas de salida principal
  socket.on('output:templates', (templates) => {
    s.outputTemplates = Array.isArray(templates) ? templates : [];
    saveOrgSetting(orgId, 'outputTemplates', s.outputTemplates);
    emitToOrg('output:templates', s.outputTemplates);
  });

  // Plantillas streaming/virtual
  socket.on('virtual:templates', (templates) => {
    s.virtualTemplates = Array.isArray(templates) ? templates : [];
    saveOrgSetting(orgId, 'virtualTemplates', s.virtualTemplates);
    emitToOrg('virtual:templates', s.virtualTemplates);
  });

  // Guardar tema de la UI
  socket.on('settings:theme', (theme) => {
    s.appTheme = String(theme);
    saveOrgSetting(orgId, 'appTheme', s.appTheme);
    emitToOrg('app:theme', s.appTheme);
  });

  // Guardar configuración de pantallas físicas
  socket.on('settings:displays:save', (config) => {
    s.displayConfig = { ...s.displayConfig, ...config };
    saveOrgSetting(orgId, 'displayConfig', s.displayConfig);
    emitToOrg('display:config', s.displayConfig);
  });

  // Actualizar configuración virtual / NDI
  socket.on('virtual:config', (config) => {
    s.virtualConfig = { ...s.virtualConfig, ...config };
    saveOrgSetting(orgId, 'virtualConfig', s.virtualConfig);
    ndi.updateState(s.liveState, s.virtualConfig);
    if (s.virtualConfig.ndiEnabled) {
      ndi.start();
    } else {
      ndi.stop();
    }
    emitToOrg('virtual:config', s.virtualConfig);
    emitToOrg('ndi:status', ndi.getStatus());
  });

  // Navegar: el móvil u otro cliente pide avanzar/retroceder
  socket.on('navigate', (dir) => {
    if (s.currentSong && s.currentSong.slides.length > 0) {
      const { slides, songId, songTitle, songAuthor, songKey } = s.currentSong;

      if (s.currentSong.titleSlideActive) {
        if (dir === 'next') {
          s.currentSong.titleSlideActive = false;
          s.currentSong.slideIndex = 0;
          const slide     = slides[0];
          const nextSlide = slides[1] || null;
          const bgMedia = slide.slide_background || null;
          s.liveState = {
            ...s.liveState,
            backgroundMedia: bgMedia,
            isBlank: false,
            slideData: { type: 'song', songId, slideId: slide.id, songTitle, songKey: songKey || null, label: slide.label, content: slide.content },
            nextSlideData: nextSlide ? { type: 'song', label: nextSlide.label, content: nextSlide.content } : null,
          };
          ndi.updateState(s.liveState, s.virtualConfig);
          emitToOrg('live:state', s.liveState);
        }
        return;
      }

      const { slideIndex } = s.currentSong;
      const newIndex = dir === 'next'
        ? Math.min(slideIndex + 1, slides.length - 1)
        : Math.max(slideIndex - 1, 0);

      if (dir === 'prev' && slideIndex === 0 && s.outputConfig.titleSlideEnabled) {
        s.currentSong.titleSlideActive = true;
        s.currentSong.slideIndex = -1;
        s.liveState = {
          ...s.liveState,
          backgroundMedia: s.outputConfig.titleBackground || null,
          isBlank: false,
          slideData: { type: 'title', songTitle, songAuthor, songId, songKey: songKey || null },
          nextSlideData: { type: 'song', label: slides[0].label, content: slides[0].content },
        };
        ndi.updateState(s.liveState, s.virtualConfig);
        emitToOrg('live:state', s.liveState);
        return;
      }

      if (newIndex === slideIndex) return;
      s.currentSong.slideIndex = newIndex;
      const slide     = slides[newIndex];
      const nextSlide = slides[newIndex + 1] || null;
      const bgMedia = slide.slide_background || s.liveState.backgroundMedia;
      s.liveState = {
        ...s.liveState,
        backgroundMedia: bgMedia,
        isBlank: false,
        slideData: {
          type: 'song', songId, slideId: slide.id, songTitle,
          songKey: songKey || null, label: slide.label, content: slide.content,
        },
        nextSlideData: nextSlide ? { type: 'song', label: nextSlide.label, content: nextSlide.content } : null,
      };
      ndi.updateState(s.liveState, s.virtualConfig);
      emitToOrg('live:state', s.liveState);
    } else {
      socket.broadcast.to(`org:${orgId}`).emit('navigate', dir);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Org ${orgId} — cliente desconectado: ${socket.id}`);
  });

  // ── Transposición global de canción (modo Cancionero) ──────────────────────
  // songKeyOffsets: Map<songId, number> dentro del estado de org
  if (!s.songKeyOffsets) s.songKeyOffsets = {};

  // Cuando un cliente se conecta y pide el offset actual de una canción
  socket.on('song:getKeyOffset', (songId) => {
    socket.emit('song:keyOffset', { songId, offset: s.songKeyOffsets[songId] ?? 0 });
  });

  // Cuando un cliente cambia la key globalmente
  socket.on('song:setKeyOffset', ({ songId, offset }) => {
    s.songKeyOffsets[songId] = offset;
    emitToOrg('song:keyOffset', { songId, offset });
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
app.use('/api/band-configs',  bandConfigsRouter);
app.use('/api/blocked-dates', blockedDatesRouter);
app.use('/api/notifications', notificationsRouter);

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
