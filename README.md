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

## Integración con Spotify

El módulo **Cancionero** permite crear una playlist privada en Spotify con las canciones del setlist y generar un código QR en el PDF del evento.

### Requisitos previos

- Cuenta de Spotify (gratuita o Premium)
- Acceso al [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

---

### 1 · Crear una Spotify App

1. Ve a [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) e inicia sesión.
2. Haz clic en **Create app**.
3. Rellena los campos:
   - **App name**: el nombre que quieras (p. ej. `AIO Presenter`)
   - **App description**: opcional
   - **Redirect URIs**: agrega las URIs donde correrá la app:
     - Desarrollo: `http://localhost:5173/cancionero/spotify-callback`
     - Producción: `https://tu-dominio.com/cancionero/spotify-callback`
   - **APIs used**: marca **Web API**
4. Acepta los términos y haz clic en **Save**.
5. En la página de la app, copia el **Client ID** (cadena de 32 caracteres).

> **Modo desarrollo vs. Producción**  
> Una app recién creada está en modo *Development*. En ese modo solo pueden autenticarse los usuarios que añadas explícitamente en **Settings → User Management** (máx. 25 usuarios). Para uso sin restricciones solicita la extensión a producción desde el dashboard.

---

### 2 · Configurar el Client ID en AIO Presenter

Hay dos formas (la opción A tiene prioridad si está disponible):

#### Opción A — desde la interfaz (recomendada para cada organización)

1. Inicia sesión como **admin**.
2. Ve a **Cancionero → Configuración**.
3. Pega el **Client ID** en el campo *Spotify Client ID* y guarda.

#### Opción B — variable de entorno (sirve como fallback)

Agrega la variable en el archivo de entorno del cliente:

```bash
# client/.env.local  (desarrollo)
VITE_SPOTIFY_CLIENT_ID=tu_client_id_aqui

# client/.env.production  (producción / Vercel)
VITE_SPOTIFY_CLIENT_ID=tu_client_id_aqui
```

En Vercel puedes configurarla en **Project → Settings → Environment Variables**.

---

### 3 · Agregar usuarios autorizados (solo modo Development)

Si la app sigue en modo *Development*, cada usuario de Spotify que vaya a usarla debe estar en la lista blanca:

1. Dashboard → tu app → **Settings → User Management**.
2. Agrega el correo de la cuenta de Spotify del usuario.
3. Guarda los cambios.

---

### 4 · Cómo funciona la feature

1. Abre el detalle de un evento en el Cancionero.
2. (Solo admins) Haz clic en **Crear playlist en Spotify**.
3. Se abrirá la autorización de Spotify en la misma ventana.
4. Al autorizar, la app crea automáticamente una playlist privada con todas las canciones del setlist que tengan link de Spotify.
5. La URL de la playlist queda guardada en el navegador (localStorage) asociada al evento.
6. La próxima vez que generes el **PDF del setlist**, aparecerá un código QR con el enlace a esa playlist.

> El flujo usa **PKCE** (Authorization Code with PKCE) — no se necesita ningún *Client Secret* ni configuración en el servidor.

---

## Próximas fases

- [x] Módulo Biblia (navegación libro/capítulo/versículo)
- [x] Importar Biblia en formato JSON (admin panel)
- [x] Programa / Schedule (lista de canciones del servicio)
- [x] Temas visuales personalizados (fuente, tamaño, color de texto)
- [x] Imágenes y videos de fondo
- [x] Importar letras desde ChordPro / OpenSong
- [ ] Importar Biblia en formato OSIS/XML

---

## Importar datos de la Biblia

El **Panel de Administración** (`/admin`) incluye una sección de gestión de Biblia.  
Desde allí puedes cargar versiones completas sin acceso directo al servidor.

### Formatos soportados

#### Formato A — thiagobodruk/bible (recomendado)

Array de 66 libros en orden canónico. Cada libro tiene un campo `chapters` que es
un array de capítulos, y cada capítulo es un array de strings (versículos).

```json
[
  {
    "abbrev": "gn",
    "book": "Genesis",
    "chapters": [
      ["En el principio creó Dios los cielos y la tierra.", "Y la tierra estaba desordenada y vacía..."],
      ["..."]
    ]
  }
]
```

Fuente pública de ejemplo (RVR):  
`https://raw.githubusercontent.com/thiagobodruk/bible/master/json/es_rvr.json`

#### Formato B — Unificado (con metadatos explícitos)

Objeto con campo `books`. Útil para versiones con datos de libros no estándar.

```json
{
  "version": "NVI",
  "name": "Nueva Versión Internacional",
  "language": "es",
  "books": [
    {
      "number": 1,
      "name": "Génesis",
      "abbrev": "Gn",
      "testament": "OT",
      "chapters": [
        ["En el principio, Dios creó los cielos y la tierra."],
        ["..."]
      ]
    }
  ]
}
```

### Cómo importar

1. Inicia sesión como **owner** y ve a `/admin`.
2. Despliega la sección **Gestión de Biblia**.
3. Completa la abreviatura (ej. `RVR60`), el nombre y el idioma.
4. Selecciona el archivo JSON.
5. Haz clic en **Importar versión**.

> Si ya existe una versión con la misma abreviatura, sus versículos se reemplazarán por los del archivo nuevo.
