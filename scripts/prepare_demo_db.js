// Script para preparar la base de datos de demostración
// Lee la base de referencia sin modificarla y crea una base de demostración separada
// con los mismos 197 IDs y geometrías, pero con resultados precalculados.

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENCE_DB_PATH = join(__dirname, '..', 'db', 'parcelas_master.sqlite');
const DEMO_DB_PATH = join(__dirname, '..', 'db', 'parcelas_demo.sqlite');

// Negarse a sobrescribir un archivo existente
if (existsSync(DEMO_DB_PATH)) {
  console.error(`Error: El archivo de demostración ya existe en ${DEMO_DB_PATH}`);
  console.error('Elimínelo primero si desea regenerarlo.');
  process.exit(1);
}

// Abrir base de referencia (solo lectura)
const refDb = new Database(REFERENCE_DB_PATH, { readonly: true });

// Crear base de demostración (lectura-escritura)
const demoDb = new Database(DEMO_DB_PATH);

// Iniciar transacción para la base de demostración
demoDb.transaction(() => {
  // Crear tabla parcelas (misma estructura que la referencia)
  demoDb.exec(`
    CREATE TABLE parcelas (
      ID_POLIGONO TEXT PRIMARY KEY,
      geometria_geojson TEXT NOT NULL,
      longitud_ref REAL NOT NULL,
      latitud_ref REAL NOT NULL
    );
  `);

  // Crear tablas de resultados (como espera server.js)
  demoDb.exec(`
    CREATE TABLE parcelas_resultados (
      ID_POLIGONO TEXT NOT NULL,
      campaña TEXT NOT NULL,
      versión_modelo TEXT NOT NULL,
      prediccion REAL NOT NULL,
      observado REAL,
      PRIMARY KEY (ID_POLIGONO, campaña, versión_modelo)
    );
  `);

  demoDb.exec(`
    CREATE TABLE parcelas_contribuciones (
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

  // Copiar datos de parcelas de referencia a demostración
  const parcelas = refDb.prepare('SELECT ID_POLIGONO, geometria_geojson, longitud_ref, latitud_ref FROM parcelas').all();
  const insertParcelas = demoDb.prepare(`
    INSERT INTO parcelas (ID_POLIGONO, geometria_geojson, longitud_ref, latitud_ref)
    VALUES (@ID_POLIGONO, @geometria_geojson, @longitud_ref, @latitud_ref)
  `);

  for (const p of parcelas) {
    insertParcelas.run(p);
  }

  // Función semideterminista basada en cadena
  function stringHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a entero de 32 bits
    }
    return Math.abs(hash);
  }

  // Generar número determinista en [0, 1) a partir de cadena y sal
  function deterministicFloat(str, salt = '') {
    const hash = stringHash(str + salt);
    // Devolver flotante en [0, 1)
    return (hash % 10000) / 10000;
  }

  // Generar número determinista en rango [min, max]
  function deterministicRange(str, min, max, salt = '') {
    return min + (deterministicFloat(str, salt) * (max - min));
  }

  // Campañas - usaremos tres años
  const campaigns = ['2021', '2022', '2023'];
  const latestCampaign = '2023';
  const modelVersion = 'demo-v1';

  // Para cada parcela, generar datos
  for (const parcel of parcelas) {
    const id = parcel.ID_POLIGONO;
    
    // Generar datos para cada campaña
    const campaignData = [];
    for (const campaña of campaigns) {
      // Predicción base varía por parcela y campaña
      const prediccionBase = deterministicRange(id + campaña, 2.0, 6.0);
      
      // Para observado: 
      // - Para 2023: 20% de probabilidad de nulo (observación faltante)
      // - Para otras campañas: normalmente presente pero a veces nulo (10% de probabilidad)
      let observado = null;
      const nullChance = (campaña === latestCampaign) ? 0.2 : 0.1;
      if (deterministicFloat(id + campaña + '_obs') > nullChance) {
        // Observado es predicción más algún error
        const error = deterministicRange(id + campaña + '_err', -0.8, 0.8);
        observado = prediccionBase + error;
        // Asegurar no negativo (el rendimiento no puede ser negativo)
        observado = Math.max(0.1, observado);
      }
      
      campaignData.push({ campaña, prediccion: prediccionBase, observado });
    }

    // Insertar resultados de campaña
    const insertResult = demoDb.prepare(`
      INSERT INTO parcelas_resultados 
      (ID_POLIGONO, campaña, versión_modelo, prediccion, observado)
      VALUES (@ID_POLIGONO, @campaña, @versión_modelo, @prediccion, @observado)
    `);

    for (const data of campaignData) {
      insertResult.run({
        ID_POLIGONO: id,
        campaña: data.campaña,
        versión_modelo: modelVersion,
        prediccion: data.prediccion,
        observado: data.observado
      });
    }

    // Generar contribuciones para la campaña más reciente
    // Crearemos 4 contribuciones que sumen a un valor razonable
    const contributionVariables = [
      { variable: 'NDVI', unidad: 'adimensional', valorRange: [0.3, 0.8] },
      { variable: 'Precipitación acumulada', unidad: 'mm', valorRange: [200, 600] },
      { variable: 'Temperatura mínima media', unidad: '°C', valorRange: [2, 12] },
      { variable: 'Pendiente', unidad: 'grados', valorRange: [0, 15] }
    ];

    // Generar contribuciones deterministas pero variables
    const contributions = [];
    let sumAportes = 0;
    
    for (const cv of contributionVariables) {
      // Generar valor en rango
      const valor = deterministicRange(id + '_' + cv.variable, cv.valorRange[0], cv.valorRange[1]);
      
      // Generar aporte_t_ha de manera que la suma total esté entre -1.5 y 1.5
      // Haremos que cada aporte sea proporcional al valor pero con signo y magnitud aleatorios
      const aporteFactor = deterministicRange(id + '_' + cv.variable + '_aporte', -0.5, 0.5);
      const aporte = aporteFactor * (valor / 100); // Escalar hacia abajo
      
      contributions.push({
        variable: cv.variable,
        valor: valor,
        unidad: cv.unidad,
        aporte_t_ha: aporte
      });
      
      sumAportes += aporte;
    }

    // Calcular predicción base: prediccion = base + sum(aportes)
    // Ya tenemos la predicción de la campaña más reciente
    const latestPrediccion = campaignData.find(d => d.campaña === latestCampaign).prediccion;
    const valor_base = latestPrediccion - sumAportes;

    // Insertar contribuciones
    const insertContrib = demoDb.prepare(`
      INSERT INTO parcelas_contribuciones 
      (ID_POLIGONO, campaña, versión_modelo, variable, valor, unidad, aporte_t_ha)
      VALUES (@ID_POLIGONO, @campaña, @versión_modelo, @variable, @valor, @unidad, @aporte_t_ha)
    `);

    for (const contrib of contributions) {
      insertContrib.run({
        ID_POLIGONO: id,
        campaña: latestCampaign,
        versión_modelo: modelVersion,
        variable: contrib.variable,
        valor: contrib.valor,
        unidad: contrib.unidad,
        aporte_t_ha: contrib.aporte_t_ha
      });
    }
  }
})();

// Cerrar bases de datos
refDb.close();
demoDb.close();

console.log(`Base de demostración creada exitosamente en ${DEMO_DB_PATH}`);
console.log(`Procesadas ${parcelas.length} parcelas`);
