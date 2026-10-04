import express from 'express';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'parcelas_master.sqlite');
const PORT = process.env.PORT || 3000;

// READ_ONLY=1 (recomendado en producción): la base se abre solo para lectura y se desactiva la carga por API.
const READ_ONLY = process.env.READ_ONLY === '1';
const db = new Database(DB_PATH, { readonly: READ_ONLY, fileMustExist: READ_ONLY });
// Tablas aditivas. Sin FOREIGN KEY a propósito: ID_POLIGONO es la clave central
// y puede tener datos aunque no exista geometría en `parcelas`.
if (!READ_ONLY) db.exec(`
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

// Tablas para resultados precalculados (solo se crean si no existen y no estamos en solo lectura)
if (!READ_ONLY) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS parcelas_resultados (
    ID_POLIGONO TEXT NOT NULL,
    campaña TEXT NOT NULL,
    versión_modelo TEXT NOT NULL,
    prediccion REAL NOT NULL,
    observado REAL,
    PRIMARY KEY (ID_POLIGONO, campaña, versión_modelo)
  );
  CREATE TABLE IF NOT EXISTS parcelas_contribuciones (
    ID_POLIGONO TEXT NOT NULL,
    campaña TEXT NOT NULL,
    versión_modelo TEXT NOT NULL,
    variable TEXT NOT NULL,
    valor REAL NOT NULL,
    unidad TEXT NOT NULL,
    aporte_t_ha REAL NOT NULL,
    PRIMARY KEY (ID_POLIGONO, campaña, versión_modelo, variable)
  );
  `);
}

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
  if (READ_ONLY) return r.status(403).json({ error: 'Servidor en modo solo lectura' });
  if (process.env.API_KEY && q.get('x-api-key') !== process.env.API_KEY) return r.status(401).json({ error: 'No autorizado' });
  if (!Array.isArray(q.body)) return r.status(400).json({ error: 'Se esperaba un arreglo' });
  const ins = db.prepare('INSERT OR REPLACE INTO datos VALUES (?,?,?,?,?)');
  db.transaction(rows => rows.forEach(x => ins.run(x.ID_POLIGONO, x.capa_id, x.fecha ?? '', x.variable ?? '', x.valor)))(q.body);
  r.json({ insertados: q.body.length });
});

// Nuevo endpoint: GET /api/parcelas/:id/dashboard
app.get('/api/parcelas/:id/dashboard', (req, res) => {
  try {
    const data = getParcelDashboardData(req.params.id);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Nuevo endpoint: POST /api/parcelas/:id/informacion-inteligente
app.post('/api/parcelas/:id/informacion-inteligente', async (req, res) => {
  try {
    const context = getParcelDashboardData(req.params.id);
    const explanation = await getLLMExplanation(context);
    res.json({ explanation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Función auxiliar para obtener los datos del dashboard para una parcela
function getParcelDashboardData(id) {
  // Verificar que la parcela exista
  const parcel = db.prepare('SELECT ID_POLIGONO, longitud_ref, latitud_ref FROM parcelas WHERE ID_POLIGONO = ?').get(id);
  if (!parcel) {
    throw new Error('ID_POLIGONO no encontrado');
  }

  // Obtener la campaña más reciente para esta parcela
  const latestCampaignRow = db.prepare(`
    SELECT campaña 
    FROM parcelas_resultados 
    WHERE ID_POLIGONO = ? 
    ORDER BY campaña DESC 
    LIMIT 1
  `).get(id);

  if (!latestCampaignRow) {
    throw new Error('No hay resultados para esta parcela');
  }
  const campaña = latestCampaignRow.campaña;

  // Obtener el resultado para esta parcela y campaña
  const resultRow = db.prepare(`
    SELECT prediccion, observado, versión_modelo
    FROM parcelas_resultados
    WHERE ID_POLIGONO = ? AND campaña = ?
  `).get(id, campaña);

  if (!resultRow) {
    throw new Error('No hay resultados para esta parcela y campaña');
  }

  // Obtener las contribuciones para esta parcela y campaña
  const contribucionesRows = db.prepare(`
    SELECT variable, valor, unidad, aporte_t_ha
    FROM parcelas_contribuciones
    WHERE ID_POLIGONO = ? AND campaña = ?
  `).all(id, campaña);

  // Calcular valor_base: prediccion - sum(aporte_t_ha)
  const sumAportes = contribucionesRows.reduce((sum, c) => sum + c.aporte_t_ha, 0);
  const valor_base = resultRow.prediccion - sumAportes;

  // Calcular errores
  let error_firmado = null;
  let error_absoluto = null;
  let error_relativo_pct = null;
  if (resultRow.observado !== null) {
    error_firmado = resultRow.prediccion - resultRow.observado;
    error_absoluto = Math.abs(error_firmado);
    if (resultRow.observado !== 0) {
      error_relativo_pct = (Math.abs(error_firmado) / Math.abs(resultRow.observado)) * 100;
    }
  }

  // Obtener historial: todas las campañas para esta parcela
  const historialRows = db.prepare(`
    campaña, prediccion, observado
    FROM parcelas_resultados
    WHERE ID_POLIGONO = ?
    ORDER BY campaña
  `).all(id);

  // Calcular MAE: promedio de errores absolutos para observados no nulos
  let mae_historial_t_ha = null;
  const validObservations = historialRows.filter(h => h.observado !== null);
  if (validObservations.length > 0) {
    const sumAbsErrors = validObservations.reduce((sum, h) => {
      const error = h.prediccion - h.observado;
      return sum + Math.abs(error);
    }, 0);
    mae_historial_t_ha = sumAbsErrors / validObservations.length;
  }

  // Construir historial_simulado
  const historialSimulado = historialRows.map(h => ({
    campaña: h.campaña,
    observado: h.observado,
    prediccion: h.prediccion
  }));

  // Construir y devolver el objeto de respuesta
  return {
    schema_version: 1,
    ID_POLIGONO: id,
    referencia: {
      longitud_ref: parcel.longitud_ref,
      latitud_ref: parcel.latitud_ref,
      fuente: "parcelas_master"
    },
    mediciones_existentes: [], // No utilizamos la tabla datos para el dashboard en esta implementación
    demo: {
      es_demo: process.env.DEMO_MODE === '1',
      version: "dashboard-demo-v1",
      modelo: resultRow.version_modelo,
      unidad_rendimiento: "t/ha",
      observado_simulado: resultRow.observado,
      prediccion_simulada: resultRow.prediccion,
      valor_base_simulado: valor_base,
      contribuciones_simuladas: contribucionesRows.map(c => ({
        variable: c.variable,
        valor: c.valor,
        unidad: c.unidad,
        aporte_t_ha: c.aporte_t_ha
      })),
      historial_simulado: historialSimulado,
      intervalo_prediccion: null
    },
    metricas_demo: {
      error_firmado_t_ha: error_firmado,
      error_absoluto_t_ha: error_absoluto,
      error_relativo_pct: error_relativo_pct,
      mae_historial_t_ha: mae_historial_t_ha
    }
  };
}

// Adaptador para LLM (Gemini API)
async function getLLMExplanation(context) {
  const LLM_MODE = process.env.LLM_MODE || 'mock';
  
  // Modo mock: respuesta de demostración
  if (LLM_MODE === 'mock') {
    return `Demostración: sin llamada a IA.
    
Este es un texto de explicación de demostración. En modo real, se llamaría a la API de Google Gemini para generar una explicación basada en el contexto proporcionado.

Contexto de la parcela:
- ID: ${context.ID_POLIGONO}
- Coordenadas de referencia: (${context.referencia.latitud_ref}, ${context.referencia.longitud_ref})
- Modelo: ${context.demo.modelo}
- Unidad de rendimiento: ${context.demo.unidad_rendimiento}
- Rendimiento observado: ${context.demo.observado_simulado !== null ? context.demo.observado_simulado + ' ' + context.demo.unidad_rendimiento : 'No disponible'}
- Rendimiento predicho: ${context.demo.prediccion_simulada} ${context.demo.unidad_rendimiento}
- Error firmado: ${context.metricas_demo.error_firmado_t_ha !== null ? context.metricas_demo.error_firmado_t_ha + ' ' + context.demo.unidad_rendimiento : 'No disponible (observado ausente)'}
- Error absoluto: ${context.metricas_demo.error_absoluto_t_ha !== null ? context.metricas_demo.error_absoluto_t_ha + ' ' + context.demo.unidad_rendimiento : 'No disponible'}
- Error relativo: ${context.metricas_demo.error_relativo_pct !== null ? context.metricas_demo.error_relativo_pct.toFixed(2) + '%' : 'No disponible'}
- MAE historial: ${context.metricas_demo.mae_historial_t_ha !== null ? context.metricas_demo.mae_historial_t_ha + ' ' + context.demo.unidad_rendimiento : 'No disponible'}

Contribuciones:
${context.demo.contribuciones_simuladas.map(c => `- ${c.variable}: ${c.valor} ${c.unidad} → aporte: ${c.aporte_t_ha.toFixed(2)} ${context.demo.unidad_rendimiento}`).join('\n')}

Limitaciones:
- Los valores son simulados y no constituyen una predicción agrícola real.
- No se dispone de historial suficiente para calcular MAE en algunas parcelas.
- Las contribuciones son locales y no prueban causalidad.
`;
  }

  // Modo live: llamada a Gemini API
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY no configurada. No se puede realizar la llamada a IA en modo live.');
  }

  const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest'; // Modelo Flash-Lite gratuito
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  // Instrucciones fijas
  const fixedInstructions = `Eres un asistente educativo que interpreta métricas agrícolas de una parcela.
Responde en español claro y explica los tecnicismos al usarlos. Usa únicamente el
contexto JSON suministrado para afirmar valores de esta parcela. Si el contexto
contiene DEMO, comienza indicando que los valores y aportes son simulados y no
constituyen una predicción agrícola real.

Describe: resumen de la parcela, variables y unidades, rendimiento previsto,
comparación con observado si existe, errores, aportes locales disponibles,
limitaciones y datos adicionales necesarios.

Explica cada variable con su valor, unidad y significado. No calculas métricas
nuevas: usa las métricas calculadas por el servidor. No inventas datos ausentes,
modelo entrenado, precisión validada, intervalos ni fuentes. La ausencia de
observado impide evaluar el error de esa parcela.

Los aportes locales disponibles describen una explicación del modelo o una
simulación; no prueban causalidad. No deduzcas aportes ni importancia global a
partir de los valores brutos de NDVI, precipitación o temperatura. Cuando falte
una explicación local, dilo. No atribuyas microclimas a un ráster sin resolución
suficiente ni recomiendes intervenciones agronómicas como certezas.

Presenta secciones legibles en texto plano con títulos sencillos y párrafos.
Aclara qué procede del contexto y qué es una explicación general del concepto.`;

  // Preparar el cuerpo de la solicitud
  const requestBody = {
    contents: [{
      role: "user",
      parts: [
        { text: fixedInstructions },
        { text: JSON.stringify(context, null, 2) }
      ]
    }],
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.7
    }
  };

  // Realizar la solicitud con timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos

  try {
    const response = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Error de la API: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Extraer el texto de la respuesta
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
      throw new Error('Respuesta inesperada de la API de Gemini');
    }

    const textParts = data.candidates[0].content.parts
      .filter(part => part.text)
      .map(part => part.text);
    
    if (textParts.length === 0) {
      throw new Error('La API de Gemini no devolvió texto en la respuesta');
    }

    return textParts.join('\n');
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Timeout al llamar a la API de Gemini (10 segundos)');
    }
    throw error;
  }
}

app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`AgroCebada web en http://localhost:${PORT}`));
