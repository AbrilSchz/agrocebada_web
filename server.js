import express from 'express';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'parcelas_master.sqlite');
const PORT = process.env.PORT || 3000;

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
// Tablas aditivas. Sin FOREIGN KEY a propósito: ID_POLIGONO es la clave central
// y puede tener datos aunque no exista geometría en `parcelas`.
db.exec(`
CREATE TABLE IF NOT EXISTS capas (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, grupo TEXT NOT NULL DEFAULT 'Procesamiento',
  descripcion TEXT, unidad TEXT, min REAL, max REAL
);
CREATE TABLE IF NOT EXISTS datos (
  ID_POLIGONO TEXT NOT NULL, capa_id TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT '', variable TEXT NOT NULL DEFAULT '', valor REAL,
  PRIMARY KEY (ID_POLIGONO, capa_id, fecha, variable)
);
CREATE INDEX IF NOT EXISTS idx_datos_capa ON datos(capa_id, fecha);
`);

const app = express();
app.use(express.json());

app.get('/api/health', (_q, r) => r.json({ ok: true }));

// GeoJSON de todas las parcelas que tienen geometría
app.get('/api/parcelas', (_q, r) => {
  const rows = db.prepare('SELECT ID_POLIGONO, longitud_ref, latitud_ref, geometria_geojson FROM parcelas ORDER BY ID_POLIGONO').all();
  r.json({
    type: 'FeatureCollection',
    features: rows.map(p => ({
      type: 'Feature', id: p.ID_POLIGONO,
      properties: { ID_POLIGONO: p.ID_POLIGONO, longitud_ref: p.longitud_ref, latitud_ref: p.latitud_ref },
      geometry: JSON.parse(p.geometria_geojson)
    }))
  });
});

// Ficha de un polígono: funciona aunque no tenga geometría
app.get('/api/parcelas/:id', (q, r) => {
  const id = q.params.id;
  const base = db.prepare('SELECT ID_POLIGONO, longitud_ref, latitud_ref FROM parcelas WHERE ID_POLIGONO = ?').get(id) || null;
  const datos = db.prepare(`SELECT d.capa_id, c.nombre AS capa, d.fecha, d.variable, d.valor
    FROM datos d LEFT JOIN capas c ON c.id = d.capa_id
    WHERE d.ID_POLIGONO = ? ORDER BY d.capa_id, d.fecha`).all(id);
  if (!base && !datos.length) return r.status(404).json({ error: 'ID_POLIGONO no encontrado' });
  r.json({ ID_POLIGONO: id, tiene_geometria: !!base, ...(base || {}), datos });
});

app.get('/api/capas', (_q, r) => r.json(db.prepare('SELECT * FROM capas ORDER BY grupo, nombre').all()));

app.get('/api/capas/:id/fechas', (q, r) =>
  r.json(db.prepare("SELECT DISTINCT fecha FROM datos WHERE capa_id = ? ORDER BY fecha").all(q.params.id).map(x => x.fecha)));

// Valores por ID_POLIGONO para pintar el mapa: { "AGC_001": 0.42, ... }
app.get('/api/capas/:id/valores', (q, r) => {
  let { fecha, variable } = q.query;
  if (fecha === undefined) fecha = db.prepare('SELECT MAX(fecha) AS f FROM datos WHERE capa_id = ?').get(q.params.id)?.f ?? '';
  const rows = variable === undefined
    ? db.prepare('SELECT ID_POLIGONO, AVG(valor) AS v FROM datos WHERE capa_id = ? AND fecha = ? GROUP BY ID_POLIGONO').all(q.params.id, fecha)
    : db.prepare('SELECT ID_POLIGONO, valor AS v FROM datos WHERE capa_id = ? AND fecha = ? AND variable = ?').all(q.params.id, fecha, variable);
  r.json({ fecha, valores: Object.fromEntries(rows.map(x => [x.ID_POLIGONO, x.v])) });
});

// Ingesta: POST /api/datos  [{ID_POLIGONO, capa_id, fecha?, variable?, valor}]
// Protegida con API_KEY si está definida en el entorno.
app.post('/api/datos', (q, r) => {
  if (process.env.API_KEY && q.get('x-api-key') !== process.env.API_KEY) return r.status(401).json({ error: 'No autorizado' });
  if (!Array.isArray(q.body)) return r.status(400).json({ error: 'Se esperaba un arreglo' });
  const ins = db.prepare('INSERT OR REPLACE INTO datos VALUES (?,?,?,?,?)');
  db.transaction(rows => rows.forEach(x => ins.run(x.ID_POLIGONO, x.capa_id, x.fecha ?? '', x.variable ?? '', x.valor)))(q.body);
  r.json({ insertados: q.body.length });
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`AgroCebada web en http://localhost:${PORT}`));
