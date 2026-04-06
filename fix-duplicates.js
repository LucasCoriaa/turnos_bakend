const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?sslmode=require`,
});

async function fix() {
  // Borrar los duplicados por ID (los de ID mayor)
  const result = await pool.query(
    'DELETE FROM services WHERE id IN (12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25)'
  );
  console.log('Eliminados:', result.rowCount, 'servicios duplicados');

  // Verificar lo que queda
  const check = await pool.query('SELECT id, business_id, name FROM services ORDER BY business_id, id');
  console.log('Servicios que quedan:');
  check.rows.forEach(r => console.log('  ID:' + r.id + ' | ' + r.business_id + ' | ' + r.name));

  await pool.end();
}

fix().catch(err => { console.error('Error:', err.message); pool.end(); });