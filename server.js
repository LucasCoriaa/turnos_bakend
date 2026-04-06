console.log('Iniciando servidor...');
require('dotenv').config();
console.log('DATABASE_URL cargada:', process.env.DATABASE_URL ? 'SI' : 'NO');

const express = require('express');
const cors    = require('cors');
const pg      = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

console.log('Creando pool...');
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
console.log('Pool creado');

db.on('error', (err) => {
  console.error('Error en pool de DB:', err.message);
});

/* ── INIT BASE DE DATOS ─────────────────────────────────────── */
async function initDB() {
  console.log('Conectando a la base de datos...');
  try {
    await db.query('SELECT 1');
    console.log('Conexion exitosa!');
  } catch(e) {
    console.error('Error de conexion:', e.message);
    process.exit(1);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      emoji       TEXT,
      category    TEXT,
      phone       TEXT,
      address     TEXT,
      active      BOOLEAN DEFAULT true,
      schedule    JSONB,
      theme       JSONB
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS services (
      id          SERIAL PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      duration    INTEGER,
      price       INTEGER,
      icon        TEXT,
      active      BOOLEAN DEFAULT true
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id          SERIAL PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
      service_id  INTEGER REFERENCES services(id) ON DELETE SET NULL,
      date        DATE NOT NULL,
      time        TIME NOT NULL,
      name        TEXT NOT NULL,
      phone       TEXT NOT NULL,
      email       TEXT,
      notes       TEXT,
      status      TEXT DEFAULT 'confirmed',
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS blocked_dates (
      id          SERIAL PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
      date        DATE NOT NULL,
      reason      TEXT,
      UNIQUE(business_id, date)
    )
  `);

  await db.query(`
    INSERT INTO businesses (id, name, emoji, category, phone, active, schedule, theme)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (id) DO NOTHING
  `, [
    'biz_001',
    'Barberia Demo',
    '💈',
    'Barberia profesional',
    '5493513824513',
    true,
    JSON.stringify({
      workDays:    [1,2,3,4,5,6],
      slotMinutes: 30,
      blocks: [
        { startHour: 9,  endHour: 13 },
        { startHour: 15, endHour: 20 }
      ]
    }),
    JSON.stringify({
      accent:        '#c9a84c',
      accentLight:   '#e2c97e',
      accentDim:     'rgba(201,168,76,0.12)',
      bgMain:        '#0e0e0e',
      bgCard:        '#161616',
      bgElevated:    '#1f1f1f',
      border:        '#2a2a2a',
      textPrimary:   '#f0ece4',
      textSecondary: '#8a8580',
      textMuted:     '#4a4845'
    })
  ]);

  console.log('Base de datos lista');
}

/* ── BUSINESSES ─────────────────────────────────────────────── */
app.get('/api/businesses', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM businesses');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM businesses WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── SERVICES ───────────────────────────────────────────────── */
app.get('/api/businesses/:id/services', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM services WHERE business_id = $1 ORDER BY id',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/businesses/:id/services', async (req, res) => {
  try {
    const { name, duration, price, icon } = req.body;
    const { rows } = await db.query(
      'INSERT INTO services (business_id, name, duration, price, icon) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, name, duration, price, icon || '⭐']
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/services/:id', async (req, res) => {
  try {
    const fields = Object.keys(req.body);
    const values = Object.values(req.body);
    const set    = fields.map((f, i) => f + ' = $' + (i + 1)).join(', ');
    const { rows } = await db.query(
      'UPDATE services SET ' + set + ' WHERE id = $' + (fields.length + 1) + ' RETURNING *',
      [...values, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/services/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM services WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── BOOKINGS ───────────────────────────────────────────────── */
app.get('/api/businesses/:id/bookings', async (req, res) => {
  try {
    const { date } = req.query;
    const query  = date
      ? 'SELECT * FROM bookings WHERE business_id = $1 AND date = $2 ORDER BY time'
      : 'SELECT * FROM bookings WHERE business_id = $1 ORDER BY date, time';
    const params = date ? [req.params.id, date] : [req.params.id];
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/businesses/:id/bookings', async (req, res) => {
  try {
    const { service_id, date, time, name, phone, email, notes } = req.body;

    const { rows: existing } = await db.query(
      "SELECT id FROM bookings WHERE business_id = $1 AND service_id = $2 AND date = $3 AND time = $4 AND status != 'cancelled'",
      [req.params.id, service_id, date, time]
    );
    if (existing.length > 0) return res.status(409).json({ error: 'Este horario ya esta reservado' });

    const { rows } = await db.query(
      'INSERT INTO bookings (business_id, service_id, date, time, name, phone, email, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [req.params.id, service_id, date, time, name, phone, email || null, notes || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bookings/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM bookings WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/businesses/:id/bookings', async (req, res) => {
  try {
    await db.query('DELETE FROM bookings WHERE business_id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── BLOCKED DATES ──────────────────────────────────────────── */
app.get('/api/businesses/:id/blocked', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM blocked_dates WHERE business_id = $1 ORDER BY date',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/businesses/:id/blocked', async (req, res) => {
  try {
    const { date, reason } = req.body;
    const { rows } = await db.query(
      'INSERT INTO blocked_dates (business_id, date, reason) VALUES ($1,$2,$3) ON CONFLICT (business_id, date) DO UPDATE SET reason = $3 RETURNING *',
      [req.params.id, date, reason]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/businesses/:id/blocked/:date', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM blocked_dates WHERE business_id = $1 AND date = $2',
      [req.params.id, req.params.date]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── ARRANCAR ───────────────────────────────────────────────── */
const PORT = process.env.PORT || 3000;

console.log('Llamando initDB...');
initDB().then(() => {
  app.listen(PORT, () => {
    console.log('Servidor corriendo en http://localhost:' + PORT);
  });
}).catch(err => {
  console.error('ERROR EN INITDB:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('ERROR NO MANEJADO:', err.message);
});