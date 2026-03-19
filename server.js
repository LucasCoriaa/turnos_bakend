/* ================================================================
   server.js — Servidor principal
   Express + PostgreSQL para el sistema de turnos
================================================================ */

const express  = require('express');
const cors     = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app  = express();
const port = process.env.PORT || 3000;

/* ── Middleware ──────────────────────────────────────────────── */
app.use(cors());
app.use(express.json());

/* ── Conexión a PostgreSQL ───────────────────────────────────── */
const pool = new Pool({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?uselibpqcompat=true&sslmode=require`,
});

pool.connect((err) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
  } else {
    console.log('✅ Conectado a PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool:', err.message);
});

/* ================================================================
   RUTAS — NEGOCIOS
================================================================ */

// GET /api/businesses — todos los negocios
app.get('/api/businesses', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM businesses WHERE active = true ORDER BY created_at'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error en GET /businesses:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/businesses/:id — un negocio por ID
app.get('/api/businesses/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM businesses WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error en GET /businesses/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================
   RUTAS — SERVICIOS
================================================================ */

// GET /api/businesses/:id/services — servicios de un negocio
app.get('/api/businesses/:id/services', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM services WHERE business_id = $1 AND active = true ORDER BY created_at',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error en GET /services:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/businesses/:id/services — agregar servicio
app.post('/api/businesses/:id/services', async (req, res) => {
  const { name, duration, price, icon } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO services (business_id, name, duration, price, icon) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, name, duration, price, icon]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error en POST /services:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/services/:id — actualizar servicio
app.patch('/api/services/:id', async (req, res) => {
  const { name, duration, price, icon, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE services SET
        name     = COALESCE($1, name),
        duration = COALESCE($2, duration),
        price    = COALESCE($3, price),
        icon     = COALESCE($4, icon),
        active   = COALESCE($5, active)
       WHERE id = $6 RETURNING *`,
      [name, duration, price, icon, active, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error en PATCH /services/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/services/:id — eliminar servicio
app.delete('/api/services/:id', async (req, res) => {
  try {
    await pool.query('UPDATE services SET active = false WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /services/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================
   RUTAS — TURNOS (BOOKINGS)
================================================================ */

// GET /api/businesses/:id/bookings — turnos de un negocio
app.get('/api/businesses/:id/bookings', async (req, res) => {
  try {
    let query  = 'SELECT * FROM bookings WHERE business_id = $1 AND status != $2';
    let params = [req.params.id, 'cancelled'];

    if (req.query.date) {
      query += ' AND date = $3';
      params.push(req.query.date);
    }

    query += ' ORDER BY date, time';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en GET /bookings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/businesses/:id/bookings — crear turno
app.post('/api/businesses/:id/bookings', async (req, res) => {
  const { service_id, date, time, name, phone, email, notes } = req.body;

  try {
    // Verificar doble reserva
    const existing = await pool.query(
      'SELECT id FROM bookings WHERE business_id=$1 AND service_id=$2 AND date=$3 AND time=$4 AND status!=$5',
      [req.params.id, service_id, date, time, 'cancelled']
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Este horario ya está reservado' });
    }

    const result = await pool.query(
      `INSERT INTO bookings (business_id, service_id, date, time, name, phone, email, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, service_id, date, time, name, phone, email || null, notes || null]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error en POST /bookings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bookings/:id — cancelar turno
app.delete('/api/bookings/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE bookings SET status=$1 WHERE id=$2',
      ['cancelled', req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /bookings/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/businesses/:id/bookings — borrar todos los turnos
app.delete('/api/businesses/:id/bookings', async (req, res) => {
  try {
    await pool.query(
      'UPDATE bookings SET status=$1 WHERE business_id=$2',
      ['cancelled', req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /businesses/:id/bookings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================
   RUTAS — FECHAS BLOQUEADAS
================================================================ */

// GET /api/businesses/:id/blocked
app.get('/api/businesses/:id/blocked', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM blocked_dates WHERE business_id = $1 ORDER BY date',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error en GET /blocked:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/businesses/:id/blocked — bloquear fecha
app.post('/api/businesses/:id/blocked', async (req, res) => {
  const { date, reason } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO blocked_dates (business_id, date, reason)
       VALUES ($1,$2,$3)
       ON CONFLICT (business_id, date) DO NOTHING RETURNING *`,
      [req.params.id, date, reason || 'Día no disponible']
    );
    res.json(result.rows[0] || { ok: true });
  } catch (err) {
    console.error('Error en POST /blocked:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/businesses/:id/blocked/:date — desbloquear fecha
app.delete('/api/businesses/:id/blocked/:date', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM blocked_dates WHERE business_id=$1 AND date=$2',
      [req.params.id, req.params.date]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /blocked/:date:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── Arrancar servidor ───────────────────────────────────────── */
app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});