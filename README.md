# AgroCebada · Dashboard de rendimiento y contexto espacial

Explora 197 parcelas y los resultados finales recibidos en `Libretas_finales.zip`.
El mapa abre en **Satelital**. El rendimiento mostrado es un resultado cerrado en
**toneladas por hectárea (t/ha)**: no es una serie anual ni una sucesión de campañas.
Las fechas de abril–octubre de 2025 corresponden a los insumos, no a varios
rendimientos de la misma parcela.

Al iniciar, **Elevación** ya está seleccionada sobre el fondo satelital. El botón
**59 parcelas**, a la izquierda de Capas, alterna entre las parcelas de predicción
final y las 197 parcelas completas. Esas 59 no tienen observado: no constituyen
un conjunto con errores de validación medidos. La búsqueda de una referencia
que quedó fuera del filtro vuelve a mostrar todas para poder seleccionarla.

Las pestañas y tarjetas aparecen solo cuando sus datos existen. Las referencias
OOF conservan Errores; las predicciones finales lo ocultan. Aportes se muestra
cuando existen contribuciones completas o los tres aportes parciales del HGB.
Las tablas vacías se omiten. Al cambiar de parcela, una pestaña que deja de estar
disponible vuelve automáticamente a la primera pestaña con datos.

Las variables se presentan con nombres legibles (por ejemplo, **Precipitación ·
mayo 2025**). Sus identificadores originales siguen en los CSV y aparecen al
pasar sobre el nombre. La tabla de variables muestra solamente valores presentes;
los datos originales conservan sus ausencias.

## Qué muestra cada parte del dashboard

| Vista | Datos mostrados | Interpretación |
| --- | --- | --- |
| Rendimiento | Predicción y observado cuando existe | Compara dos valores de la misma parcela; sin eje de años. |
| Errores | Predicción menos observado, magnitud y porcentaje | Solo disponibles en las 138 parcelas con observado. |
| Aportes | Tres SHAP locales redondeados, cuando fueron exportados | Explican parcialmente el **HGB final**, no el ensamble ni una predicción OOF. |
| Modelo | Tres esquemas de validación, OOF por parcela e importancia global | Distingue evaluación del modelo, error individual y media de SHAP absoluto. |
| Contexto | Municipio, componentes KNN/HGB, intervalo empírico y vecinos | Intervalos y vecinos finales disponibles para las 59 parcelas de predicción. |
| Capas | PREC, Tmax y Tmin mensuales; elevación y pendiente | Cinco capas finales con unidad, fuente y agregación separadas. |
| Resultados | Coloreado por predicción, observado o error | Gris significa ausencia de dato; no significa rendimiento cero. |
| Documentación | Explicación breve y descarga de CSV originales | Permite contrastar la interfaz con las fuentes recibidas. |

El botón **AI ANALYTICS** explica valores ya almacenados. No ejecuta el modelo ni
sustituye sus predicciones. En modo `mock` produce una explicación local sin API
externa; en modo `live`, Gemini recibe contexto del servidor. La clave permanece
en el entorno del servidor, nunca en `public/` ni en los archivos versionados.

## Fuente y población

Las fuentes originales se preservan en [modelos/libretas_finales](modelos/libretas_finales/):
cuatro notebooks, el reporte DOCX, CSV, JSON y dos imágenes de diagnóstico.
Se omiten metadatos de macOS y ZIP internos que duplican los mismos archivos.

| Cohorte | Parcelas | Predicción usada en la ficha | Observado |
| --- | ---: | --- | --- |
| Referencia | 138 | `RepeatedKFold__Ensamble_50_50` del CSV OOF, promedio de tres repeticiones | `RENDIMIENTO_T_HA` recibido |
| Predicción final | 59 | `RENDIMIENTO_T_HA_PRED` del dashboard final, con precisión original | Ausente (`NULL`) |
| Total | 197 | OOF y final se identifican por separado | 138 valores reales |

Todas se relacionan por **ID_POLIGONO**, conservando sus identificadores exactos
`AGC_001`, etc. Los 197 IDs del paquete coinciden con las geometrías existentes.
No se usa orden de filas para relacionar datos ni se convierte ausencia en cero.

El paquete contiene nueve municipios: Chignahuapan (100), Calpulalpan (44),
Singuilucan (23), Almoloya (14), Cuautepec de Hinojosa (9), Emiliano Zapata (3),
Nanacamilpa de Mariano Arista (2), Apan (1) y Tepeapulco (1).
La distribución por estado reportada es Puebla 100, Hidalgo 51 y Tlaxcala 46.
**No hay un identificador de productor ni variables de manejo agrícola**:
pertenecer al mismo municipio no demuestra que dos parcelas tengan el mismo
productor, suelo, semilla, fertilización o manejo.

### Archivos que alimentan cada resultado

| Archivo dentro de `Data/` | Contenido | Uso |
| --- | --- | --- |
| `05_final/dashboard_parcelas_referencia.csv` | 138 IDs, observado, municipio y centroide | Cohorte de referencia y contexto |
| `05_final/dashboard_parcelas_prediccion.csv` | 59 predicciones, componentes, intervalos, vecinos y SHAP top 3 | Ficha de predicción final |
| `05_final/predicciones_59_ensamble.csv` | 59 predicciones redondeadas a cuatro decimales | Entrega original; se verifica contra el dashboard |
| `03_validacion/predicciones_oof_todos_esquemas.csv` | 138 filas; cinco modelos y tres esquemas | Predicción OOF de cada referencia |
| `03_validacion/resultados_validacion.csv` | 15 combinaciones de esquema y modelo | Métricas globales reportadas |
| `03_validacion/resultados_por_fold.csv` | 145 filas | Verificación de medias y desviaciones por fold |
| `03_validacion/metadatos_espaciales_validacion.csv` | 138 IDs, estado, municipio, celda CHIRPS y centroide | Metadatos de validación espacial |
| `02_fenologia/X_integrado_completo.csv` | 197 filas y 187 variables | Consulta de variables; capas de clima y topografía |
| `04_shap/importancia_variables.csv` | 187 importancias globales | Diez variables principales en Modelo |
| `04_shap/resumen_libreta04.json` | Cuantiles de error y umbral de distancia | Verificación de intervalos empíricos |

Los otros CSV/JSON de calidad, fenología, ablación, permutación, diferencias
pareadas y preguntas guía se conservan para auditoría. No se presentan como
mediciones adicionales ni como aportes SHAP locales.

## Modelo e interpretación

El ensamble recibido combina **50 % KNN espacial + 50 % HistGradientBoosting
(HGB)**. El importador comprueba esa identidad para las predicciones finales y
para los tres esquemas OOF. No reentrena modelos, no modifica sus resultados y
no evalúa notebooks durante el arranque del servidor.

Las libretas describen KNN con cinco vecinos y pesos por distancia, y HGB final
con selección de 20 variables y coordenadas forzadas. La selección e imputación
se ajustan dentro del pipeline de entrenamiento. El HGB agronómico usado para
las importancias globales es un modelo distinto, **sin coordenadas explícitas**;
las variables climáticas aún pueden contener información territorial indirecta.

### OOF: validación fuera del entrenamiento de cada fold

Una predicción OOF se calcula para una parcela que quedó fuera del entrenamiento
del fold correspondiente. Para las 138 referencias, la ficha usa el promedio de
tres predicciones OOF de RepeatedKFold. El CSV recibido no incluye las predicciones
individuales ni un único `fold_id`; por eso no se inventa ese dato.

La pestaña Modelo también permite comparar las predicciones OOF de los otros dos
esquemas para la misma parcela. Las 59 predicciones finales provienen del ajuste
con las 138 referencias y no tienen rendimiento observado con el que medir su
error. No se les asigna el observado de una parcela vecina.

### Validación global reportada

Valores del **Ensamble_50_50** en `resultados_validacion.csv`:

| Esquema | Folds | MAE pooled (t/ha) | RMSE pooled (t/ha) | R² pooled | MAE por fold ± DE (t/ha) |
| --- | ---: | ---: | ---: | ---: | ---: |
| RepeatedKFold | 15: 5 × 3 repeticiones | 0.3733 | 0.5212 | 0.6218 | 0.3731 ± 0.0718 |
| GroupKFold_CHIRPS | 5 | 0.4974 | 0.6328 | 0.4433 | 0.4804 ± 0.1481 |
| LOGO_Municipio | 9 | 0.4817 | 0.7073 | 0.3045 | 0.5230 ± 0.4238 |

- **RepeatedKFold** intercala parcelas; aproxima interpolación dentro de zonas con referencias.
- **GroupKFold_CHIRPS** mantiene separados los grupos de celdas climáticas aproximadas.
- **LOGO_Municipio** deja un municipio completo fuera del entrenamiento cada vez.

Estos agrupamientos reducen compartir muestras del mismo grupo; no garantizan
independencia geográfica completa entre zonas adyacentes ni generalización a
otros años. Las celdas CHIRPS se aproximan en las libretas a partir de coordenadas.

**Pooled** calcula métricas sobre parcelas. **Media por fold** da el mismo peso a
cada fold: en LOGO, a cada municipio, aunque tengan tamaños muy distintos. La
DE es variabilidad entre folds; no es un intervalo de confianza ni un margen de
error de una parcela. En RepeatedKFold las métricas pooled se promedian entre las
tres repeticiones. Calcular errores después de promediar sus predicciones OOF
no reproduce necesariamente esa misma métrica global.

El MAE global no se coloca en la tarjeta del error individual. El error firmado
es `predicción − observado`; el absoluto es su magnitud; el relativo es
`100 × |error| / |observado|`, ausente si el observado falta o es cero.

### Intervalos empíricos nominales al 80 %

Para las 59 predicciones se conservan los intervalos exportados:

- Con referencias cercanas: predicción ± **0.5675694879 t/ha**.
- Sin referencias cercanas: predicción ± **0.7596200162 t/ha**.
- Umbral de proximidad: **2027.2287439 m**, percentil 95 de la distancia al vecino
  más cercano entre las 138 referencias.

Los semianchos son el percentil 80 de errores absolutos OOF: RepeatedKFold para
interpolación y LOGO para zonas nuevas. En este paquete, las **59 parcelas** quedan
clasificadas como interpolación. El importador verifica cuantiles, distancias y
extremos del intervalo, pero no demuestra cobertura predictiva futura.

Son intervalos empíricos orientativos. No son intervalos de confianza formales,
ni conformales con cobertura garantizada. El promediado OOF puede introducir
optimismo, y no hay una cohorte independiente para confirmar su cobertura.

Las tres referencias vecinas exportadas usan distancia **haversine**, en metros,
entre centroides. No son la descomposición matemática del KNN: ese modelo usa
**cinco** vecinos sobre coordenadas escaladas, cuyo orden puede diferir.
Los centroides del paquete no reemplazan los puntos interiores de la base ni
los contornos de las parcelas.

### SHAP: qué explicación está disponible

La pestaña Aportes de las 59 predicciones presenta **tres aportes redondeados del
HGB final**, en t/ha. El signo indica cómo contribuyen a la salida de ese
componente respecto de su base. El paquete no aporta su base ni el resto del
vector para reconstruirla. No se calcula una base artificial restando esos tres
valores a la predicción. Tampoco se suman a la predicción del ensamble.

Para las 138 predicciones OOF no se recibió una descomposición local completa.
Las barras globales de Modelo son la **media de |SHAP|** del HGB agronómico en
15 folds, con su desviación. Esos valores son no negativos y describen importancia
en el conjunto; no explican por qué la predicción de una parcela sube o baja.
No se mezclan con los tres aportes locales del HGB final.

Para habilitar una explicación completa se necesitan, por ID y modelo: valor
base, vector completo de aportes, predicción explicada, unidad, pipeline y
procedencia del explicador. Para OOF también se requiere el fold correspondiente.
Debe comprobarse `base + suma(aportes) = predicción explicada` y distinguir la
salida del HGB de la del ensamble. SHAP no demuestra causalidad agronómica.

## Variables, unidades y fechas

Los 187 valores originales pueden consultarse dentro de Modelo, por parcela.
Las libretas los agrupan en suelo/térmico (7), vegetación (9), agua (3),
topografía (2), clima (21), física (9), fenología (135) y área (1).
Las variables agregadas no equivalen a imágenes satelitales crudas.

| Familia | Unidad / agregación documentada | Cómo aparece |
| --- | --- | --- |
| `PREC_2025_MM_mean` | mm; media espacial del raster mensual CHIRPS | Capa Precipitación, siete meses |
| `Tmax_2025_MM_mean`, `Tmin_2025_MM_mean` | °C; media espacial mensual CHIRTS | Dos capas separadas, siete meses |
| `Elevacion_INEGI_CEM4_120m_mean` | m; media espacial | Capa Elevación estática |
| `Pendiente_INEGI_CEM4_120m_grados_mean` | grados; media espacial | Capa Pendiente estática |
| Índices `__mediana` | Mediana temporal de promedios espaciales por captura; unidad según índice | Tabla de variables del modelo |
| Fenología `__auc`, `__p90`, `__iqr`, etc. | Variables derivadas definidas en Libreta 02 | Tabla de variables; no se inventa una unidad común |
| Física / área | Agregaciones y fórmulas de Libreta 02 | Tabla de variables; consultar definición original |

El clima mensual se almacena con `AAAA-MM-01` como **identificador del mes**.
Ese día no representa una medición diaria ni una fecha de captura. Elevación y
pendiente usan fecha vacía. Las familias basico/pro permanecen separadas en los
nombres: no se promedian sensores ni unidades diferentes para generar una capa.

El paquete no incluye un diccionario validado de unidades para las 187 variables.
La tabla mantiene sus nombres originales. No se etiqueta automáticamente todo
como adimensional. Los GeoTIFF y capturas individuales necesarios para repetir
la extracción zonal no forman parte de este ZIP.

## Discrepancias y reproducibilidad

El reporte DOCX se conserva tal como se recibió. Algunas cifras de su sección 5.3
no coinciden con los CSV: cita HGB con MAE ~0.4381 y ensamble ~0.3812, mientras
`resultados_validacion.csv` registra para RepeatedKFold **0.4041** y **0.3733**,
respectivamente (MAE pooled). La cifra LOGO ~0.6173 del reporte tampoco identifica
la misma combinación y agregación que la tabla del ensamble anterior.
La interfaz toma sus métricas del CSV, con modelo y esquema explícitos.
Se requiere una conciliación del reporte por sus autores antes de citarlo como
si todas sus cifras correspondieran a esta exportación.

Las libretas contienen código para generar `WEB_1`, `WEB_2`, `WEB_3` y un modelo
`joblib`, pero esos archivos no están en el ZIP recibido. La integración utiliza
los CSV existentes; no afirma haber ejecutado ese código ni disponer del modelo
serializado. Tampoco reentrena para fabricar explicaciones que no fueron entregadas.

## Estados y municipios en el mapa

En **Capas → Estados y municipios**, una casilla activa u oculta ambos niveles
con un clic. Estados usa línea ámbar continua; municipios, línea azul clara
discontinua. Esta capa es independiente del coloreado de las parcelas y no
intercepta sus clics. Los polígonos se cargan una vez y se reutilizan al alternar.

La copia local está en `public/geografia/limites.geojson`: tres estados (Hidalgo,
Puebla y Tlaxcala) y 169 municipios cuyos rectángulos envolventes intersectan la
región de navegación. Contiene los nueve municipios del conjunto agrícola. Los
polígonos permanecen completos: no se recortan para dibujar fronteras artificiales
en el borde del mapa.

Fuente: [servicio oficial de INEGI](https://www.inegi.org.mx/servicios/catalogounico.html),
Marco Geoestadístico **diciembre de 2025**, consultado el **12 de octubre de 2026**.
Se usaron `geo/mgee/{entidad}` y `geo/mgem/{entidad}` para las claves 13, 21 y 29.
El archivo incluye las URL, los metadatos y hashes SHA-256 de las respuestas
originales. No depende de una llamada a INEGI durante la navegación.

Las coordenadas GeoJSON conservan [longitud, latitud]. La geometría se generalizó
con Douglas–Peucker y tolerancia 0.0005 grados; se redondeó a seis decimales. Son
límites **geoestadísticos para referencia visual**, no una delimitación jurídica
ni una herramienta para asignar municipios a una parcela. Los municipios de las
fichas siguen proviniendo del paquete del modelo. Si amplías la región del mapa,
comprueba también la cobertura de este archivo.

## Arquitectura y almacenamiento

- `modelos/libretas_finales/`: fuentes recibidas y conservadas para auditoría.
- `scripts/importar_libretas.py`: adapta y valida ese contrato de datos finales.
- `scripts/importar_modelo.py`: mantiene el importador genérico de Excel/ZIP/CSV.
- `db/parcelas_master.sqlite`: geometrías y capas anteriores de referencia, intactas.
- `db/parcelas_final.sqlite`: copia preparada y versionada para esta entrega.
- `parcelas_resultados`: resultados con tipo OOF/final y errores precalculados.
- `parcelas_contexto_modelo`: municipio, componentes, vecinos, intervalos y variables.
- `modelo_resumen`: evaluación global y trazabilidad por conjunto/modelo.
- `modelo_importaciones`: origen, fecha UTC y hash del manifiesto de tablas.

La migración añade tablas; conserva geometrías y valores anteriores. Los tres
SHAP parciales se guardan en contexto, no como una descomposición completa dentro
de `parcelas_contribuciones`. Los hashes SHA-256 individuales de los CSV/JSON y
el hash de su manifiesto se consultan en `/api/modelo/resumen`.

El servidor usa `DB_PATH` si está definido. En su ausencia, selecciona
`parcelas_final.sqlite` cuando existe y, en caso contrario, la base de referencia.
Los importadores trabajan fuera del servidor; producción debe ser de solo lectura.

## Ejecutar localmente

Requisitos: **Node 22+**, npm y **Python 3.10+** solo para importar o verificar.
No se necesitan paquetes Python adicionales para los importadores.

```sh
npm ci
env DB_PATH=db/parcelas_final.sqlite READ_ONLY=1 DEMO_MODE=0 LLM_MODE=mock PORT=3000 npm run dev
```

Abre http://localhost:3000. La base final ya viene preparada; no necesitas importar
ni generar datos sintéticos para ver esta entrega. Usa `npm run dev:local` si
quieres cargar un `.env` basado en `.env.example`. Los cambios de frontend
requieren recargar el navegador. Para ajustar los límites o revisar una rama,
consulta [PROBAR_MAPA_LOCAL.md](docs/PROBAR_MAPA_LOCAL.md).

## Sustituir un paquete final

Con el servidor detenido, primero valida:

```sh
npm run importar:final -- /ruta/Libretas_finales.zip --validar
npm run importar:final -- /ruta/Libretas_finales.zip
```

También puedes reconstruir desde las fuentes versionadas:

```sh
npm run importar:final -- modelos/libretas_finales --validar
npm run importar:final -- modelos/libretas_finales
```

Se comprueban IDs únicos y cohortes disjuntas, conteos, valores finitos, observado,
ensamble, entrega redondeada, cuantiles, distancias, intervalos y métricas por fold.
Los IDs sin geometría se almacenan y reportan; no se dibujan. Los datos de este
conjunto se sustituyen como una instantánea; los otros conjuntos y valores
anteriores se conservan. Los vacíos del nuevo resultado permanecen ausentes.

La salida se prepara en un archivo temporal, se comprueba su integridad y se
sustituye de forma atómica. Una reimportación crea antes una copia
`parcelas_final.sqlite.backup-FECHA`. La base de geometrías nunca es la salida.
Usa `--base` y `--salida` para trabajar con rutas distintas.

Para Excel con el contrato genérico, consulta [IMPORTAR_MODELO.md](docs/IMPORTAR_MODELO.md).
Un Excel arbitrario no reemplaza automáticamente el paquete científico final:
las tablas y metadatos necesarios deben corresponder al contrato documentado.

## Verificación

```sh
npm run verificar:importador
npm run verificar:final
npm run verificar:api
npm run verificar:presentacion
node --check server.js
node --check public/app.js
node --check public/config.js
node --check public/labels.js
git diff --check
```

Las pruebas usan bases temporales y verifican errores de entrada, reimportación,
conservación de geometrías, ausencia frente a cero, respaldo y datos ajenos.
El importador confirma `PRAGMA integrity_check`; `/api/health` solo comprueba que
responde el proceso, no la integridad científica ni SQLite.

## API

| Ruta | Contenido |
| --- | --- |
| `GET /api/health` | Estado del proceso |
| `GET /api/parcelas` | GeoJSON de las 197 geometrías |
| `GET /api/parcelas/:id/dashboard` | Resultado, contexto, mediciones y modelo; esquema v4 |
| `GET /api/modelo/resumen` | Métricas, importancia global y hashes de fuentes |
| `GET /api/resultados/campanas` | Catálogo de conjuntos/modelos; nombre legacy de la ruta |
| `GET /api/resultados/valores` | Valores para colorear el mapa |
| `GET /api/capas` | Capas con unidades y procedencia |
| `GET /api/capas/:id/fechas` | Identificadores de los meses o fecha vacía |
| `GET /api/capas/:id/valores` | Valores por parcela de la capa seleccionada |
| `POST /api/parcelas/:id/informacion-inteligente` | Explicación local o Gemini |
| `GET /fuentes/...` | CSV/JSON originales de `Data/` |

Los selectores `campaña` y `version_modelo` se conservan por compatibilidad:
para esta entrega, `campaña=agrocebada-final` identifica un conjunto, no un año.
Ejemplo de consulta:

```text
/api/parcelas/AGC_003/dashboard?campaña=agrocebada-final&version_modelo=ensamble-50-50-v1
```

## Render, merge y recuperación

Esta rama propone código, fuentes y una base ya preparada. El merge a `main`
puede activar el autodespliegue configurado en Render; crear la PR no publica.
No se modifica la configuración de CI ni se importan datos durante el arranque.

En Render verifica `READ_ONLY=1`, `DEMO_MODE=0` y
`DB_PATH=db/parcelas_final.sqlite`. Un `DB_PATH` anterior tiene prioridad sobre
el archivo final, incluso después del merge. `PORT` lo proporciona el entorno.
Para usar IA real, configura `GEMINI_API_KEY` solo en Render y `LLM_MODE=live`.
El Dockerfile mantiene Node 22 y `npm ci --omit=dev`.

Para recuperar una reimportación, detén el servidor y restaura la copia de
respaldo en la ruta de salida. Para volver a las geometrías y capas originales,
selecciona `DB_PATH=db/parcelas_master.sqlite`; esa base no contiene los resultados
finales. Cambiar `DB_PATH` permite comparar o recuperar sin sobrescribir referencias.

## Alcance científico

La entrega es retrospectiva, con 138 etiquetas y una sola ventana de insumos.
Las comparaciones pequeñas frente a la variabilidad entre folds no establecen
superioridad del ensamble ni equivalencia entre modelos. Las libretas reconocen
que ajustar hiperparámetros sobre las mismas particiones puede producir optimismo.
Las asociaciones espaciales, importancia SHAP e intervalos empíricos describen
este modelo y este conjunto; no prueban causalidad, prácticas compartidas,
validación en otros años ni precisión garantizada para una parcela nueva.
