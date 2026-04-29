-- AIO Presenter - Database Schema
-- Ejecutar en PostgreSQL: psql -U postgres -d aio_presenter -f schema.sql

CREATE DATABASE IF NOT EXISTS aio_presenter;

-- ==========================================
-- CANCIONES / SONGS
-- ==========================================
CREATE TABLE IF NOT EXISTS songs (
  id         SERIAL PRIMARY KEY,
  title      VARCHAR(255) NOT NULL,
  author     VARCHAR(255),
  copyright  VARCHAR(255),
  ccli       VARCHAR(50),
  language   VARCHAR(10) DEFAULT 'es',
  tags       TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Secciones de cada canción (Intro, Verso 1, Coro, Puente, etc.)
CREATE TABLE IF NOT EXISTS song_slides (
  id        SERIAL PRIMARY KEY,
  song_id   INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  label     VARCHAR(100) NOT NULL,  -- "Verso 1", "Coro", "Puente"
  content   TEXT NOT NULL,          -- Letra de esa sección
  position  INTEGER NOT NULL DEFAULT 0
);

-- Orden de presentación por defecto de las secciones
CREATE TABLE IF NOT EXISTS song_arrangements (
  id       SERIAL PRIMARY KEY,
  song_id  INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  name     VARCHAR(100) NOT NULL DEFAULT 'Default',
  order_   INTEGER[] NOT NULL  -- Array de song_slide IDs en orden
);

-- ==========================================
-- BIBLIA / BIBLE
-- ==========================================
CREATE TABLE IF NOT EXISTS bible_versions (
  id           SERIAL PRIMARY KEY,
  abbreviation VARCHAR(20) NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL,
  language     VARCHAR(10) DEFAULT 'es'
);

CREATE TABLE IF NOT EXISTS bible_books (
  id          SERIAL PRIMARY KEY,
  version_id  INTEGER NOT NULL REFERENCES bible_versions(id) ON DELETE CASCADE,
  book_number INTEGER NOT NULL,
  name        VARCHAR(100) NOT NULL,
  abbrev      VARCHAR(20),
  testament   VARCHAR(3) CHECK (testament IN ('OT', 'NT'))
);

CREATE TABLE IF NOT EXISTS bible_verses (
  id         SERIAL PRIMARY KEY,
  book_id    INTEGER NOT NULL REFERENCES bible_books(id) ON DELETE CASCADE,
  chapter    INTEGER NOT NULL,
  verse      INTEGER NOT NULL,
  text       TEXT NOT NULL,
  UNIQUE (book_id, chapter, verse)
);

-- ==========================================
-- PRESENTACIONES / SCHEDULES
-- ==========================================
CREATE TABLE IF NOT EXISTS schedules (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  date       DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id          SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('song', 'bible', 'blank')),
  ref_id      INTEGER,    -- song_id o bible_verse start id
  meta        JSONB,      -- datos adicionales (rango de versículos, arreglo, etc.)
  position    INTEGER NOT NULL DEFAULT 0
);

-- ==========================================
-- CALENDARIO / EVENTS
-- ==========================================
CREATE TABLE IF NOT EXISTS events (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  date         DATE NOT NULL,
  time         TIME,
  description  TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence   VARCHAR(20) CHECK (recurrence IN ('weekly', 'biweekly', 'monthly')),
  recur_end    DATE,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- Playlist de canciones de un evento
CREATE TABLE IF NOT EXISTS event_songs (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  song_id    INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  notes      TEXT
);

-- ==========================================
-- ÍNDICES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_song_slides_song_id ON song_slides(song_id);
CREATE INDEX IF NOT EXISTS idx_bible_verses_book ON bible_verses(book_id, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule ON schedule_items(schedule_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_event_songs_event ON event_songs(event_id);

-- ==========================================
-- DATOS DE EJEMPLO
-- ==========================================
INSERT INTO songs (title, author, tags) VALUES
  ('Cuán Grande es Él', 'Carl Gustav Boberg', ARRAY['adoración', 'clásico']),
  ('Renuévame', 'Marcos Witt', ARRAY['adoración', 'contemporáneo'])
ON CONFLICT DO NOTHING;

INSERT INTO song_slides (song_id, label, content, position) VALUES
  (1, 'Verso 1', 'Señor mi Dios, al contemplar los cielos,
El firmamento y las estrellas mil,
Al oír tu voz en los potentes truenos
Y ver brillar al sol en su cenit;', 0),
  (1, 'Coro', 'Cuán grande es Él, cuán grande es Él,
Cuán grande es Él, cuán grande es Él.', 1),
  (2, 'Verso 1', 'Renuévame, renuévame,
No quiero ser igual.
Renuévame, renuévame,
Transforma todo en mí.', 0),
  (2, 'Coro', 'Señor, en tus manos me entrego,
Sé que me vas a cambiar.
Tu Espíritu en mí se ha encendido,
Y nunca se apagará.', 1)
ON CONFLICT DO NOTHING;

INSERT INTO bible_versions (abbreviation, name, language) VALUES
  ('RVR60', 'Reina-Valera 1960', 'es'),
  ('NVI', 'Nueva Versión Internacional', 'es'),
  ('KJV', 'King James Version', 'en')
ON CONFLICT DO NOTHING;
