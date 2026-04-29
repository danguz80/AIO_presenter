require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

const songsRouter  = require('./routes/songs');
const bibleRouter  = require('./routes/bible');
const importRouter = require('./routes/import');
const ndi          = require('./ndi/ndiSender');

const app    = express();
const server = http.createServer(app);

// ─── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000'];
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
  type:          null,   // 'song' | 'bible' | 'blank' | null
  slideData:     null,   // datos del slide actual
  nextSlideData: null,   // datos del siguiente slide (para pantalla de escenario)
  isBlank:       false,
  background:    { color: '#000000', type: 'color' },
};

/** Configuración independiente de la pantalla de escenario */
let stageConfig = {
  background:    { type: 'color', color: '#1e1e2e' },
  showClock:     true,
  showNextSlide: true,
  fontSize:      'auto', // 'auto' | 'small' | 'medium' | 'large'
};

/** Configuración de la salida virtual / NDI */
let virtualConfig = {
  background:  { type: 'transparent' }, // 'transparent' | 'color' | 'chromakey'
  chromaColor: '#00b140',
  fontSize:    'auto',
  ndiEnabled:  false,
};

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
  socket.emit('virtual:config',  virtualConfig);
  socket.emit('ndi:status',      ndi.getStatus());

  // El operador envía un slide a proyectar
  socket.on('live:show', (data) => {
    liveState = { ...liveState, ...data, isBlank: false };
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

  // Actualizar configuración de la pantalla de escenario
  socket.on('stage:config', (config) => {
    stageConfig = { ...stageConfig, ...config };
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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
