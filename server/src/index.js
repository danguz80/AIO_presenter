require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

const songsRouter  = require('./routes/songs');
const bibleRouter  = require('./routes/bible');
const importRouter = require('./routes/import');

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
  type:      null,   // 'song' | 'bible' | 'blank' | null
  slideData: null,   // datos del slide actual
  isBlank:   false,
  background: { color: '#000000', type: 'color' },
};

io.on('connection', (socket) => {
  console.log(`[Socket] Cliente conectado: ${socket.id}`);

  // Enviar estado actual al cliente que se conecta
  socket.emit('live:state', liveState);

  // El operador envía un slide a proyectar
  socket.on('live:show', (data) => {
    liveState = { ...liveState, ...data, isBlank: false };
    io.emit('live:state', liveState);
  });

  // Pantalla en negro / en blanco
  socket.on('live:blank', (isBlank) => {
    liveState.isBlank = isBlank;
    io.emit('live:state', liveState);
  });

  // Cambiar fondo
  socket.on('live:background', (bg) => {
    liveState.background = bg;
    io.emit('live:state', liveState);
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
