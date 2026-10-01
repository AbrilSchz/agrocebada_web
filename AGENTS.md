# AGENTS.md — AgroCebada

## Objetivo y comunicación
Esta web permite explorar parcelas y sus mediciones agrícolas. Explica en español
el resultado, las decisiones importantes y los términos nuevos. El usuario quiere
aprender: después de completar el trabajo, plantea como máximo una pregunta breve
sobre la decisión central cuando sea útil. No bloquees tareas claras con preguntas
didácticas. Distingue lo comprobado de las suposiciones.

## Arquitectura
- `public/`: interfaz HTML/CSS/JavaScript y mapa Leaflet.
- `public/config.js`: configuración del mapa, fondos y región cuando exista.
- `server.js`: Express, API y archivos estáticos; consultas con better-sqlite3.
- `db/parcelas_master.sqlite`: base de referencia versionada.
- `scripts/importar_csv.js`: importación local de mediciones.
- `scripts/preparar_deploy.js`: preparación del archivo SQLite para despliegue.
- `scripts/seed_demo.js`: genera datos sintéticos, no mediciones reales.

Antes de trabajar, lee el estado de Git, los archivos afectados y package.json.
Verifica el estado actual del código; esta guía no sustituye su inspección.

## Flujo de cambios
- Trabaja en una rama por tarea y entrega una PR enfocada. Conserva cambios ajenos.
- Resuelve decisiones rutinarias sin pedir confirmación. Pregunta cuando falten
  criterios que cambien materialmente el resultado.
- Separa cambios de interfaz/código de actualizaciones de datos, salvo que la tarea
  requiera ambos. Evita nuevas dependencias y refactorizaciones ajenas al objetivo.
- Crear una PR no equivale a publicar. Integra en main cuando el usuario lo pida;
  recuerda que esa integración puede activar el despliegue.
- No uses force-push ni descartes trabajo ajeno para resolver conflictos.

## Contrato de datos
- `parcelas`: identidad y geometría; clave primaria `ID_POLIGONO`.
  El conjunto de referencia actual contiene 197 parcelas.
- `capas`: metadatos de visualización; clave primaria `id`.
- `datos`: valores; clave compuesta
  `(ID_POLIGONO, capa_id, fecha, variable)`.
- Relaciona por identificadores, nunca por orden de filas. Conserva los IDs exactos.
- El esquema actual no declara claves foráneas. El importador admite IDs sin
  geometría y los avisa; no afirmes que SQLite rechaza automáticamente esos casos.
  Reporta IDs desconocidos en datos reales. Cambiar esta política requiere una
  tarea explícita y una migración compatible con los datos existentes.
- No conviertas ausencia de medición en cero. El importador actual omite celdas
  vacías: reimportar un vacío NO elimina una medición anterior. Si afecta la tarea,
  explica el comportamiento y define la política antes de cambiarla.
- Documenta unidad, fecha, fuente y agregación de cada variable. No promedies
  variables con significados o unidades diferentes.
- No uses ID_POLIGONO ni CONJUNTO como predictores de rendimiento.
- Nunca ejecutes seed:demo sobre la base de referencia como parte de una prueba
  o despliegue. No borres datos existentes solo por sus nombres nir/ndvi.

## Geografía e interfaz
- GeoJSON utiliza [longitud, latitud] en WGS84; Leaflet normalmente recibe
  [latitud, longitud]. No intercambies estos órdenes.
- El punto interior sirve como marcador; no sustituye el contorno para áreas
  o extracción zonal. No calcules hectáreas directamente con coordenadas en grados.
- Los fondos de calles/satélite son externos a SQLite.
- Al delimitar el mapa, comprueba todos los vértices de las parcelas necesarias,
  búsqueda, selección y ficha. Explicita si usas un rectángulo aproximado o límites
  administrativos. No confundas restringir navegación con ocultar lo exterior.
- Mantén accesibles controles y leyendas en móvil y escritorio.

## Entorno y comandos
Consulta la versión fijada en el entorno/CI; package.json actualmente exige Node >=22.
Usa npm y conserva package-lock.json coherente con package.json.
- `npm ci`: instalar dependencias desde el lockfile.
- `npm run dev`: desarrollo con recarga del servidor.
- `npm start`: arrancar el servidor.
- `npm run importar -- archivo.csv --grupo GRUPO --fecha AAAA-MM-DD`:
  importar; revisa el script para las opciones de fecha por columna.
- `npm run preparar`: crea tablas faltantes, consolida WAL y muestra integridad
  y recuentos. Modifica la base: úsalo con el servidor detenido y sobre el archivo
  previsto. No sustituye las pruebas de aplicación.
No inventes scripts npm test/lint/check: comprueba si existen antes de invocarlos.

## Verificación proporcional
- Documentación: contrasta rutas, comandos y afirmaciones con el código.
- JavaScript: ejecuta `node --check` sobre los archivos modificados y
  `git diff --check`.
- API/arranque: prueba con READ_ONLY=1 y una copia temporal consistente de la base.
  Comprueba /api/health, /api/parcelas y las rutas afectadas.
  El health actual confirma respuesta del proceso, no integridad de SQLite.
- Importación/esquema: usa una base temporal; verifica ausentes, IDs desconocidos,
  duplicados y reimportación cuando sean relevantes. Nunca pruebes escrituras
  sobre la base versionada por comodidad.
- Mapa: prueba visualmente los flujos afectados en escritorio y móvil cuando
  haya navegador disponible. Si no se hizo, indícalo.
- Un cambio de código sin actualización de datos no debe alterar el SQLite.
  Para una actualización de datos, compara recuentos, IDs y capas antes/después.
No afirmes que una prueba pasó sin ejecutarla ni añadas pruebas redundantes.

## Render y entrega
El usuario ya configuró el autodespliegue condicionado a CI en Render.
Preserva esa configuración. No crees ni reemplaces CI sin que la tarea lo requiera.
Una opción de Render no prueba que existan checks en GitHub: inspecciona los checks
reales del commit/PR si necesitas verificarlo.
Producción usa READ_ONLY=1; DB_PATH selecciona el archivo y PORT el puerto.
Las importaciones se hacen fuera del servidor publicado y se entrega la base
preparada. No añadas escrituras persistentes en Render como efecto secundario.

En cada PR explica problema, cambio, verificación y limitaciones relevantes.
Para cambios de esquema incluye migración y recuperación. Cierra con un resumen
breve, enlace a la PR y estado preciso: propuesto, integrado o desplegado.
