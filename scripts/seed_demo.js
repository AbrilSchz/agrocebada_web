// Datos DEMO (aleatorios) para probar el cambio de capas. NO son datos reales.
import Database from 'better-sqlite3';
const db = new Database(process.env.DB_PATH || 'db/parcelas_master.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS capas (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, grupo TEXT NOT NULL DEFAULT 'Procesamiento', descripcion TEXT, unidad TEXT, min REAL, max REAL);
CREATE TABLE IF NOT EXISTS datos (ID_POLIGONO TEXT NOT NULL, capa_id TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT '', variable TEXT NOT NULL DEFAULT '', valor REAL, PRIMARY KEY (ID_POLIGONO, capa_id, fecha, variable));`);
let s = 42; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const capas = [
  ['nir', 'NIR (reflectancia)', 'NIR', 'DEMO: valores aleatorios', 'ref', 0.2, 0.6],
  ['ndvi', 'NDVI procesado', 'Procesamiento', 'DEMO: valores aleatorios', '', 0, 1]
];
const insC = db.prepare('INSERT OR REPLACE INTO capas VALUES (?,?,?,?,?,?,?)');
const insD = db.prepare('INSERT OR REPLACE INTO datos VALUES (?,?,?,?,?)');
const ids = db.prepare('SELECT ID_POLIGONO FROM parcelas').all().map(x => x.ID_POLIGONO).concat('AGC_SIN_GEOM'); // un ID sin geometría
db.transaction(() => {
  capas.forEach(c => insC.run(...c));
  for (const [capa, , , , , lo, hi] of capas)
    for (const f of ['2026-01-15', '2026-02-15', '2026-03-15'])
      for (const id of ids) insD.run(id, capa, f, '', lo + rnd() * (hi - lo));
})();
console.log(`Demo cargado: ${ids.length} IDs x ${capas.length} capas x 3 fechas`);
