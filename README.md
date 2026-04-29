# AIO Presenter

Presentador de letras y Biblia tipo FreeShow / ProPresenter.
Stack: React + Vite + Tailwind · Node.js + Express + Socket.io · PostgreSQL.

---

## Estructura

```
AIO_Presenter/
├── server/          # API REST + WebSocket
│   └── src/
│       ├── config/database.js
│       ├── controllers/
│       ├── routes/
│       └── index.js
├── client/          # React + Vite
│   └── src/
│       ├── context/PresenterContext.jsx
│       ├── pages/
│       │   ├── ControllerPage.jsx   ← ventana del operador
│       │   └── OutputPage.jsx       ← ventana proyectada
│       └── components/
│           ├── Library/
│           └── Controls/
└── database/
    └── schema.sql
```

---

## Configuración rápida

### 1 · PostgreSQL

```bash
psql -U postgres
CREATE DATABASE aio_presenter;
\q
psql -U postgres -d aio_presenter -f database/schema.sql
```

### 2 · Variables de entorno del servidor

```bash
cp server/.env.example server/.env
# Edita server/.env con tus credenciales de PostgreSQL
```

### 3 · Instalar dependencias

```bash
npm run install:all
```

### 4 · Iniciar en desarrollo

```bash
# Terminal 1 – backend (puerto 3001)
npm run dev:server

# Terminal 2 – frontend (puerto 5173)
npm run dev:client
```

Abre `http://localhost:5173` para el controlador.  
Haz clic en **"Abrir Salida"** para lanzar la ventana de proyección en una nueva pestaña/ventana.

---

## Flujo básico

1. Crea canciones con el botón **"Nueva"** en la biblioteca.
2. Agrega secciones (Verso 1, Coro, Puente…) con su letra.
3. Selecciona la canción → aparecen las tarjetas de cada sección.
4. Haz clic en **Enviar** para proyectar esa sección en la ventana de salida.
5. Usa **Pantalla negra** para cortar la salida.
6. Cambia el color de fondo desde el panel de controles.

---

## Próximas fases

- [ ] Módulo Biblia (navegación libro/capítulo/versículo)
- [ ] Importar Biblia en formato OSIS/XML
- [ ] Programa / Schedule (lista de canciones del servicio)
- [ ] Temas visuales personalizados (fuente, tamaño, color de texto)
- [ ] Imágenes y videos de fondo
- [ ] Importar letras desde ChordPro / OpenSong
