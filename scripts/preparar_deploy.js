// Deja la base lista para subirla: crea tablas faltantes, une todo en UN solo archivo y muestra un resumen.
// Uso: npm run preparar   (con el servidor apagado)
import Database from 'better-sqlite3';
const db = new Database(process.env.DB_PATH || 'db/parcelas_master.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS capas (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, grupo TEXT NOT NULL DEFAULT 'Procesamiento', descripcion TEXT, unidad TEXT, min REAL, max REAL);
CREATE TABLE IF NOT EXISTS datos (ID_POLIGONO TEXT NOT NULL, capa_id TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT '', variable TEXT NOT NULL DEFAULT '', valor REAL, PRIMARY KEY (ID_POLIGONO, capa_id, fecha, variable));`);
db.pragma('wal_checkpoint(TRUNCATE)');
db.pragma('journal_mode = DELETE');
const n = t => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
console.log(`Integridad: ${db.pragma('integrity_check', { simple: true })} | parcelas: ${n('parcelas')} | capas: ${n('capas')} | valores: ${n('datos')}`);
db.close();
