// Uso: node scripts/importar_csv.js archivo.csv --grupo NIR [--fecha 2026-01-15] [--fecha-col fecha]
// El CSV debe tener una columna ID_POLIGONO. Cada OTRA columna numérica se vuelve una capa
// (id = nombre de columna) con un valor por polígono. Re-importar el mismo archivo reemplaza, no duplica.
import Database from 'better-sqlite3';
import fs from 'node:fs';

const [file, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : undefined; };
if (!file) { console.error('Falta el archivo CSV'); process.exit(1); }
const grupo = opt('grupo') || 'Procesamiento', fechaFija = opt('fecha') ?? '', fechaCol = opt('fecha-col');

function parseCSV(t) { // soporta comillas y comas dentro de comillas
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x !== '')) rows.push(r); r = []; }
    else c += ch;
  }
  if (c !== '' || r.length) { r.push(c); rows.push(r); }
  return rows;
}

const [head, ...body] = parseCSV(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const h = head.map(x => x.trim()), iId = h.indexOf('ID_POLIGONO');
if (iId < 0) { console.error('El CSV no tiene columna ID_POLIGONO. Columnas:', h.join(', ')); process.exit(1); }
const iF = fechaCol ? h.indexOf(fechaCol) : -1;
const cols = h.map((n, i) => i).filter(i => i !== iId && i !== iF);

const db = new Database(process.env.DB_PATH || 'db/parcelas_master.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS capas (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, grupo TEXT NOT NULL DEFAULT 'Procesamiento', descripcion TEXT, unidad TEXT, min REAL, max REAL);
CREATE TABLE IF NOT EXISTS datos (ID_POLIGONO TEXT NOT NULL, capa_id TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT '', variable TEXT NOT NULL DEFAULT '', valor REAL, PRIMARY KEY (ID_POLIGONO, capa_id, fecha, variable));`);
const conocidos = new Set(db.prepare('SELECT ID_POLIGONO FROM parcelas').all().map(x => x.ID_POLIGONO));
const insD = db.prepare('INSERT OR REPLACE INTO datos VALUES (?,?,?,?,?)');
const insC = db.prepare('INSERT INTO capas (id, nombre, grupo) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET grupo = excluded.grupo');
let n = 0, vacios = 0, noNum = new Set(); const sinGeom = new Set();
db.transaction(() => {
  for (const i of cols) insC.run(h[i], h[i], grupo);
  for (const row of body) {
    const id = (row[iId] ?? '').trim(); if (!id) continue;
    if (!conocidos.has(id)) sinGeom.add(id);
    const fecha = iF >= 0 ? row[iF].trim() : fechaFija;
    for (const i of cols) {
      const s = (row[i] ?? '').trim(); if (s === '') { vacios++; continue; }
      const v = Number(s); if (!Number.isFinite(v)) { noNum.add(h[i]); continue; }
      insD.run(id, h[i], fecha, '', v); n++;
    }
  }
  // min/max reales por capa para que la leyenda de color tenga sentido
  for (const i of cols) db.prepare('UPDATE capas SET min=(SELECT MIN(valor) FROM datos WHERE capa_id=?), max=(SELECT MAX(valor) FROM datos WHERE capa_id=?) WHERE id=?').run(h[i], h[i], h[i]);
})();
console.log(`Importados ${n} valores en ${cols.length} columnas (${body.length} filas).`);
if (vacios) console.log(`Celdas vacías omitidas: ${vacios}`);
if (noNum.size) console.log(`Columnas con texto no numérico (se omitió ese texto): ${[...noNum].join(', ')}`);
if (sinGeom.size) console.log(`Aviso: ${sinGeom.size} ID(s) no existen en la tabla parcelas (se guardaron igual): ${[...sinGeom].slice(0, 5).join(', ')}${sinGeom.size > 5 ? '…' : ''}`);
