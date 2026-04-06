const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?sslmode=require`,
});

async function check() {
  const result = await pool.query('SELECT id, business_id, name, active FROM services ORDER BY business_id, id');
  console.log('Servicios en la base de datos:');
  result.rows.forEach(r => console.log(`  ID:${r.id} | ${r.business_id} | ${r.name} | activo:${r.active}`));
  console.log('Total:', result.rows.length);
  await pool.end();
}

check().catch(err => { console.error(err.message); pool.end(); });
