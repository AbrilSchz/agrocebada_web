// Preparación fuera del servidor: los resultados y las métricas quedan almacenados.
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, linkSync, unlinkSync, renameSync, statSync } from 'node:fs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const referencePath = join(root, 'db', 'parcelas_master.sqlite');
const outputPath = resolve(process.env.DEMO_DB_PATH || join(root, 'db', 'parcelas_demo.sqlite'));
const complete = process.argv.includes('--completar');
const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
let source, target;
// Reutilizar consultas mantiene sus objetos vivos hasta cerrar cada conexión.
function openDatabase(filename, options) {
  const connection = new Database(filename, options);
  const prepare = connection.prepare.bind(connection), statements = new Map();
  connection.prepare = sql => {
    if (!statements.has(sql)) statements.set(sql, prepare(sql));
    return statements.get(sql);
  };
  return connection;
}
function random(id, min, max, salt = '') {
  let hash = 0;
  for (const char of id + salt) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return min + (Math.abs(hash) % 10000) / 10000 * (max - min);
}
function addResultColumns(db) {
  const names = new Set(db.prepare('PRAGMA table_info(parcelas_resultados)').all().map(x => x.name));
  for (const [name, type] of Object.entries({
    valor_base_t_ha:'REAL', error_firmado_t_ha:'REAL', error_absoluto_t_ha:'REAL',
    error_relativo_pct:'REAL', mae_historial_t_ha:'REAL', unidad_rendimiento:"TEXT NOT NULL DEFAULT 't/ha'"
  })) if (!names.has(name)) db.exec(`ALTER TABLE parcelas_resultados ADD COLUMN ${name} ${type}`);
}
function fillResults(db, ids) {
  const insertResult = db.prepare('INSERT INTO parcelas_resultados (ID_POLIGONO, campaña, versión_modelo, prediccion, observado) VALUES (?,?,?,?,?)');
  const insertContribution = db.prepare('INSERT INTO parcelas_contribuciones (ID_POLIGONO, campaña, versión_modelo, variable, valor, unidad, aporte_t_ha) VALUES (?,?,?,?,?,?,?)');
  const variables = [
    ['NDVI','adimensional',.3,.8], ['Precipitación acumulada','mm',200,600],
    ['Temperatura mínima media','°C',2,12], ['Pendiente','grados',0,15]
  ];
  for (const {ID_POLIGONO:id} of ids) {
    for (const year of ['2021','2022','2023']) {
      const prediction = random(id + year, 2, 6);
      const observed = random(id + year + '_obs', 0, 1) > (year === '2023' ? .2 : .1) ? Math.max(.1, prediction + random(id + year + '_err', -.8, .8)) : null;
      insertResult.run(id, year, 'demo-v1', prediction, observed);
    }
    for (const [name, unit, min, max] of variables) {
      const value = random(id + '_' + name, min, max);
      const contribution = random(id + '_' + name + '_aporte', -.5, .5) * value / 100;
      insertContribution.run(id, '2023', 'demo-v1', name, value, unit, contribution);
    }
  }
}
function precompute(db) {
  const groups = db.prepare('SELECT DISTINCT ID_POLIGONO, versión_modelo FROM parcelas_resultados').all();
  const rowsQuery = db.prepare('SELECT * FROM parcelas_resultados WHERE ID_POLIGONO=? AND versión_modelo=? ORDER BY campaña');
  const contributionQuery = db.prepare('SELECT aporte_t_ha FROM parcelas_contribuciones WHERE ID_POLIGONO=? AND campaña=? AND versión_modelo=?');
  const update = db.prepare('UPDATE parcelas_resultados SET valor_base_t_ha=?, error_firmado_t_ha=?, error_absoluto_t_ha=?, error_relativo_pct=?, mae_historial_t_ha=? WHERE ID_POLIGONO=? AND campaña=? AND versión_modelo=?');
  for (const group of groups) {
    const rows = rowsQuery.all(group.ID_POLIGONO, group.versión_modelo);
    const errors = rows.filter(r => r.observado != null).map(r => Math.abs(r.prediccion - r.observado));
    const mae = errors.length ? errors.reduce((a,b) => a+b, 0) / errors.length : null;
    for (const row of rows) {
      const contributions = contributionQuery.all(row.ID_POLIGONO, row.campaña, row.versión_modelo);
      const base = contributions.length ? row.prediccion - contributions.reduce((sum,c) => sum+c.aporte_t_ha,0) : null;
      const error = row.observado == null ? null : row.prediccion - row.observado;
      const absolute = error == null ? null : Math.abs(error);
      const relative = row.observado == null || row.observado === 0 ? null : absolute / Math.abs(row.observado) * 100;
      update.run(base, error, absolute, relative, mae, row.ID_POLIGONO, row.campaña, row.versión_modelo);
    }
  }
}
function validate(db, original) {
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Falló integrity_check');
  for (const table of ['parcelas','capas','datos']) {
    const before = original.prepare(`SELECT * FROM ${table}`).all();
    const after = db.prepare(`SELECT * FROM ${table}`).all();
    const normalize = rows => JSON.stringify(rows.map(row => Object.fromEntries(Object.entries(row).sort())).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    if (normalize(before) !== normalize(after)) throw new Error(`La tabla ${table} no coincide con el origen`);
  }
  const results = db.prepare('SELECT * FROM parcelas_resultados').all();
  if (!results.length) throw new Error('No hay resultados');
  const contributions = db.prepare('SELECT aporte_t_ha FROM parcelas_contribuciones WHERE ID_POLIGONO=? AND campaña=? AND versión_modelo=?');
  for (const row of results) {
    if (!Number.isFinite(row.prediccion)) throw new Error('Predicción inválida');
    const values = contributions.all(row.ID_POLIGONO,row.campaña,row.versión_modelo);
    if (values.length && Math.abs(row.valor_base_t_ha + values.reduce((sum,c) => sum+c.aporte_t_ha,0) - row.prediccion) > 1e-9) throw new Error('Aportes incoherentes');
    const expected = row.observado == null ? null : row.prediccion - row.observado;
    if (expected == null ? row.error_firmado_t_ha != null : Math.abs(expected-row.error_firmado_t_ha) > 1e-9) throw new Error('Error firmado incoherente');
  }
}
try {
  if (resolve(referencePath) === outputPath) throw new Error('La salida no puede ser la base de referencia');
  if (existsSync(outputPath)) {
    const a=statSync(referencePath), b=statSync(outputPath);
    if (a.dev===b.dev && a.ino===b.ino) throw new Error('La salida apunta a la base de referencia');
  }
  if (complete && !existsSync(outputPath)) throw new Error('No existe la base de prueba. Ejecuta npm run demo:preparar');
  if (!complete && existsSync(outputPath)) throw new Error('La base ya existe. Usa npm run demo:completar para completar sus métricas');
  source = openDatabase(complete ? outputPath : referencePath, {readonly:true, fileMustExist:true});
  source.prepare('VACUUM INTO ?').run(temporaryPath);
  target = openDatabase(temporaryPath);
  target.prepare('PRAGMA journal_mode = DELETE').get();
  const count = source.prepare('SELECT COUNT(*) AS n FROM parcelas').get().n;
  target.transaction(() => {
    target.exec(`CREATE TABLE IF NOT EXISTS parcelas_resultados (
      ID_POLIGONO TEXT NOT NULL, campaña TEXT NOT NULL, versión_modelo TEXT NOT NULL,
      prediccion REAL NOT NULL, observado REAL, PRIMARY KEY(ID_POLIGONO, campaña, versión_modelo));
      CREATE TABLE IF NOT EXISTS parcelas_contribuciones (
      ID_POLIGONO TEXT NOT NULL, campaña TEXT NOT NULL, versión_modelo TEXT NOT NULL,
      variable TEXT NOT NULL, valor REAL, unidad TEXT NOT NULL, aporte_t_ha REAL NOT NULL,
      PRIMARY KEY(ID_POLIGONO, campaña, versión_modelo, variable));`);
    addResultColumns(target);
    if (!complete) fillResults(target, source.prepare('SELECT ID_POLIGONO FROM parcelas ORDER BY ID_POLIGONO').all());
    precompute(target);
    validate(target,source);
  })();
  let backup;
  if (complete) { backup=`${outputPath}.backup-${Date.now()}`; source.prepare('VACUUM INTO ?').run(backup); }
  source.close(); source=null; target.close(); target=null;
  if (complete) renameSync(temporaryPath,outputPath);
  else { linkSync(temporaryPath,outputPath); unlinkSync(temporaryPath); }
  console.log(`Base de demostración lista: ${outputPath}`);
  console.log(`Integridad: ok | parcelas: ${count} | métricas precalculadas y aportes verificados`);
  if (backup) console.log(`Copia de la base anterior: ${backup}`);
} catch (error) {
  try { target?.close(); } catch {}
  try { source?.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm', '-journal']) if (existsSync(temporaryPath+suffix)) unlinkSync(temporaryPath+suffix);
  console.error(error.message); process.exitCode=1;
}
