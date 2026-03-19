/* ================================================================
   setup-db.js — Crea las tablas en PostgreSQL
   Ejecutá una sola vez: node setup-db.js
================================================================ */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function setup() {
  console.log('🔧 Creando tablas...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      category    TEXT,
      emoji       TEXT,
      phone       TEXT,
      address     TEXT,
      active      BOOLEAN DEFAULT true,
      schedule    JSONB,
      theme       JSONB,
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Tabla businesses creada');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id          SERIAL PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id),
      name        TEXT NOT NULL,
      duration    INTEGER NOT NULL,
      price       INTEGER NOT NULL,
      icon        TEXT DEFAULT '⭐',
      active      BOOLEAN DEFAULT true,
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Tabla services creada');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id          SERIAL PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id),
      service_id  INTEGER REFERENCES services(id),
      date        DATE NOT NULL,
      time        TEXT NOT NULL,
      name        TEXT NOT NULL,
      phone       TEXT NOT NULL,
      email       TEXT,
      notes       TEXT,
      status      TEXT DEFAULT 'confirmed',
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Tabla bookings creada');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_dates (
      id          SERIAL PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id),
      date        DATE NOT NULL,
      reason      TEXT DEFAULT 'Día no disponible',
      created_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE(business_id, date)
    );
  `);
  console.log('✅ Tabla blocked_dates creada');

  // Insertar los 3 negocios de demo
  await pool.query(`
    INSERT INTO businesses (id, name, category, emoji, phone, address, active, schedule, theme)
    VALUES
    (
      'biz_001', 'LuchitoRealG4Life', 'Barbería', '✂️', '5493513824513', '', true,
      '{"blocks":[{"startHour":11,"endHour":13},{"startHour":15,"endHour":23}],"slotMinutes":30,"workDays":[3,4,5,6]}',
      '{"accent":"#c9a84c","accentLight":"#e2c97e","accentDim":"rgba(201,168,76,0.12)","bgMain":"#0e0e0e","bgCard":"#161616","bgElevated":"#1f1f1f","border":"#2a2a2a","textPrimary":"#f0ece4","textSecondary":"#8a8580","textMuted":"#4a4845"}'
    ),
    (
      'biz_002', 'Dra. Martínez', 'Consultorio médico', '🏥', '5491187654321', 'Tucumán 890, Piso 3, CABA', true,
      '{"startHour":8,"endHour":17,"slotMinutes":20,"workDays":[1,2,3,4,5]}',
      '{"accent":"#e8458a","accentLight":"#f472b6","accentDim":"rgba(232,69,138,0.12)","bgMain":"#0f0a0d","bgCard":"#1a1018","bgElevated":"#231520","border":"#3a1f30","textPrimary":"#fce7f3","textSecondary":"#9e7a8e","textMuted":"#5c3d50"}'
    ),
    (
      'biz_003', 'Nail & Beauty', 'Centro de estética', '💅', '5491199887766', 'Santa Fe 2100, Córdoba', true,
      '{"startHour":10,"endHour":20,"slotMinutes":60,"workDays":[2,3,4,5,6]}',
      '{"accent":"#e8458a","accentLight":"#f472b6","accentDim":"rgba(232,69,138,0.12)","bgMain":"#0f0a0d","bgCard":"#1a1018","bgElevated":"#231520","border":"#3a1f30","textPrimary":"#fce7f3","textSecondary":"#9e7a8e","textMuted":"#5c3d50"}'
    )
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log('✅ Negocios de demo insertados');

  // Insertar servicios de demo
  await pool.query(`
    INSERT INTO services (business_id, name, duration, price, icon, active)
    VALUES
    ('biz_001', 'Corte clásico',    30, 2500,  '💈', true),
    ('biz_001', 'Corte + Barba',    50, 3800,  '🪒', true),
    ('biz_001', 'Coloración',       90, 6000,  '🎨', true),
    ('biz_001', 'Corte para niños', 30, 10000, '✂️', true),
    ('biz_002', 'Consulta general',  20, 4000, '🩺', true),
    ('biz_002', 'Control de rutina', 30, 5500, '📋', true),
    ('biz_002', 'Ecografía',         40, 8000, '🔬', true),
    ('biz_003', 'Manicura',          60, 3200, '💅', true),
    ('biz_003', 'Pedicura',          60, 3500, '🦶', true),
    ('biz_003', 'Depilación laser',  45, 7000, '✨', true),
    ('biz_003', 'Lifting de cejas',  90, 9500, '👁️', true)
    ON CONFLICT DO NOTHING;
  `);
  console.log('✅ Servicios de demo insertados');

  console.log('\n🎉 Base de datos lista. Podés arrancar el servidor con: node server.js');
  await pool.end();
}

setup().catch(err => {
  console.error('❌ Error:', err.message);
  pool.end();
});
