# Fruticebada · Dashboard de rendimiento y contexto espacial

Explora 197 parcelas y los resultados finales recibidos en `Libretas_finales.zip`.
El mapa abre en **Satelital**. El rendimiento mostrado es un resultado cerrado en
**toneladas por hectárea (t/ha)**: no es una serie anual ni una sucesión de campañas.
Las fechas de abril–octubre de 2025 corresponden a los insumos, no a varios
rendimientos de la misma parcela.

## Espacio de trabajo Fruticebada

En escritorio, a partir de 981 px de ancho, el mapa ocupa **65 %** y la columna
de asistente y resultados **35 %**. El asistente está abierto al entrar, sin
activar el micrófono, pedir al modelo una respuesta ni enfocar el campo de texto.
Su botón de plegado libera espacio para la ficha y permite volver a abrirlo.
La ficha tiene desplazamiento independiente; el mapa y el asistente permanecen
a mano mientras se consultan las gráficas y las tablas.

La interfaz presenta primero las tarjetas de rendimiento y las gráficas, seguidas
de componentes, intervalos y referencias. **Interpretar mi parcela** conserva
AI ANALYTICS y abre la lectura breve dentro del mismo chat. Se muestra cuando hay
una ficha cargada; las pestañas siguen dependiendo de los datos disponibles.

El panel **Capas y resultados** agrupa los filtros y la apariencia del mapa en
apartados desplegables. Tiene cierre explícito y un botón para limpiar filtros.
Puede usarse junto al chat: no se cierran entre sí. La escala permanece abajo a
la izquierda del mapa y la búsqueda por ID está en la cabecera.

En tablet y móvil, mapa, asistente y ficha se apilan para conservar el ancho de
lectura. Una barra ofrece accesos a **Mapa**, **Resultados** y **Asistente**.
En las vistas de tabla y documentación, el chat se convierte en una ventana
flotante conservando la conversación; al volver al mapa se reintegra en su columna.
El teclado, los indicadores de foco y la preferencia de movimiento reducido
continúan disponibles.

`public/workspace.css`, cargado después de `style.css`, contiene el layout y la
identidad visual. La marca visible, el nombre de la aplicación npm y la descarga
de la tabla usan Fruticebada. Se conservan `agrocebada-final`, los IDs `AGC_*`,
la URL del repositorio y los nombres originales del reporte y notebooks para
mantener compatibles las fuentes y consultas existentes. La etiqueta del conjunto
se actualiza al servirla; no se modifica SQLite para cambiar la marca.

Al iniciar, **Elevación** ya está seleccionada sobre el fondo satelital. El botón
**Parcelas de validación**, a la izquierda de Capas y resultados, conserva su nombre activado
o desactivado y alterna entre las parcelas de predicción
final y las 197 parcelas completas. Esas 59 no tienen observado: no constituyen
un conjunto con errores de validación medidos. La búsqueda de una referencia
que quedó fuera del filtro vuelve a mostrar todas para poder seleccionarla.

**Capas y resultados** reúne el coloreado temático y las métricas del modelo en
un panel. **Colorear por** elige la fuente; la escala permanece visible abajo a
la izquierda aunque el panel esté cerrado. En modo solo contornos mantiene el
gradiente con una nota que indica que no hay coloreado temático. La navegación
principal contiene Mapa, Parcelas y Documentación; la API sigue disponible para
la aplicación, sin un botón adicional en el menú.

Las gráficas de rendimiento, error y aportes son SVG vectoriales, con etiquetas,
unidades y colores consistentes. La evaluación del modelo añade tarjetas MAE/RMSE
con la misma escala entre esquemas, conservando las métricas tabulares. La gráfica
de una predicción final no añade una barra de observado inexistente.

Los contornos geográficos usan `vector-effect: non-scaling-stroke`: su grosor se
mantiene en píxeles de pantalla durante el vuelo del mapa. El contorno de la
parcela seleccionada conserva 3 px; los normales, 1.5 px si están activados.

## Chat y agente de la web

**Tu asistente de campo** está integrado en la columna derecha. Sus botones rápidos permiten
mostrar las 59 parcelas de validación, elevación, predicción, tabla y limpiar
filtros; también explican OOF y SHAP. Al abrir el chat no se llama al modelo.
Los botones envían su instrucción directamente. Enter envía y Shift+Enter añade
un salto de línea. Escape pliega el chat cuando el foco está dentro de él; en su
ventana flotante también lo cierra. Al pasar a tabla o documentación, el chat
sigue abierto y un botón flotante permite reabrirlo.

Puedes pedir, por ejemplo, «selecciona la parcela AGC_003», «muestra la elevación»
o «abre la tabla de parcelas». Estos atajos exactos funcionan sin Gemini, incluso
en modo mock. Las peticiones naturales más complejas usan *function calling*:
Gemini elige una función y sus argumentos; el servidor los valida y el navegador
los aplica mediante los mismos controles del dashboard. No se ejecuta código
propuesto por el modelo ni se modifica SQLite.

| Acción permitida | Comportamiento |
| --- | --- |
| Seleccionar parcela | Busca el ID real, abre su ficha y anima el zoom; limpia filtros que la oculten. |
| Mostrar capa | Selecciona una capa existente y, si se pide, una fecha real de sus insumos. |
| Mostrar resultados | Predicción, observado o errores almacenados; no inventa errores para las finales. |
| Filtrar parcelas | Conjunto, estado, municipio, búsqueda, disponibilidad y rango del valor mostrado; se comparte con la tabla. |
| Navegar | Mapa, tabla, documentación o vista regional. |
| Mostrar límites | Activa o desactiva la división de estados y municipios. |
| Consultar otra parcela | El servidor lee su ficha para responder sin cambiar la selección. |

El catálogo de parcelas, capas y fechas se obtiene de SQLite; los estados admitidos
corresponden al área actual (Hidalgo, Puebla y Tlaxcala). Cada turno acepta hasta
cuatro acciones o consultas y como máximo dos llamadas al modelo. La primera
propone funciones; la segunda recibe datos o acciones preparadas y redacta la
respuesta. Las acciones se despachan al navegador después de completar el turno;
las cargas posteriores conservan sus indicadores y errores habituales. No se
reemplaza una selección de parcelas finales por referencias automáticamente para
mostrar errores. La interfaz indica las acciones enviadas.

Sin parcela seleccionada, la conversación usa el conjunto completo, aunque haya
filtros en pantalla. Con una parcela usa su resultado y contexto. Al cambiar la
selección manualmente se cancela la respuesta pendiente y se reinicia el historial;
una selección hecha por el propio agente conserva ese turno con el nuevo contexto.
Los resultados verificados proceden del servidor, no del historial o de cifras
aportadas por el navegador. Las respuestas se insertan como texto, sin ejecutar
HTML. Una respuesta generada debe contrastarse con las tablas y fuentes.

**AI ANALYTICS** ahora abre el mismo chat con un párrafo de interpretación breve:
una implicación y una limitación relevantes, sin repetir los números o tarjetas.
Puedes continuar con preguntas sobre esa lectura. En modo mock es una explicación
local identificada como tal; los datos agrícolas siguen siendo los oficiales.

### Comandos por voz

Pulsa **🎙**, concede permiso al micrófono y habla; pulsa **■** para detener y enviar.
La grabación termina automáticamente a los 20 segundos. Se admite hasta 1 MiB de
audio WebM, OGG, MP4/M4A o WAV. El audio viaja al servidor y a Google para una
transcripción literal; la frase reconocida aparece como mensaje tuyo y sigue el
mismo flujo del agente. La aplicación no guarda audio en disco, SQLite o historial.
Cerrar/reiniciar el chat o cambiar de parcela cancela la captura y libera el micrófono.

La voz requiere HTTPS (o localhost), permiso del usuario, MediaRecorder compatible
y Gemini activo en el servidor. Se detectan capacidades, sin depender de
SpeechRecognition; esto permite usar navegadores que graban audio pero no ofrecen
reconocimiento nativo. Si falta permiso o la IA está desactivada, aparece un mensaje
y puedes escribir o utilizar los botones. No se activa el micrófono al abrir la web.

### Configuración y contrato

En Render usa **`LLM_MODE=live`**, **`GEMINI_API_KEY`** y el modelo configurado en
`GEMINI_MODEL`, compatible con texto, audio y funciones. `LLM_MODE=mock` permite
probar respuestas locales y acciones exactas sin llamar al proveedor. La clave
permanece en el servidor; no llega al JavaScript público.

- `POST /api/chat`: `message` (1–1500 caracteres), `history` (hasta seis pares
  user/assistant, 2000 caracteres por mensaje y 12000 en total), `ID_POLIGONO`
  opcional, `campaña`, `version_modelo` y `ui` opcional (vista/capa/métrica/filtros).
  `ui` describe preferencias de pantalla; no sustituye datos reales. Responde con
  `reply`, `mode` (`live`, `mock` o `local`), `actions` y `context`.
- `GET /api/chat/config`: informa si la voz está habilitada, sin exponer la clave.
- `POST /api/chat/voz`: `mimeType` y `audio` base64; devuelve `transcript`.
- `POST /api/parcelas/:id/informacion-inteligente`: devuelve la interpretación breve.

El historial reciente se envía en cada turno; no se persiste en el navegador ni
SQLite. Chat, interpretación y voz comparten 12 solicitudes por IP/minuto.
Cada llamada real, incluida transcripción y segundo paso del agente, cuenta para
el límite de 60 llamadas/hora y 2 simultáneas. La caché de respuestas dura 15 minutos
(hasta 100 entradas); el audio no se cachea. Cada llamada tiene un timeout de 15 s.
Se respetan errores y cuotas del proveedor; no se guardan resultados nuevos.

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
| Parcelas | Tabla con filtros, valores, ordenación y ficha dentro de la vista | Comparte la selección del mapa y permite trabajar sin abrirlo. |
| Documentación | Reto, Equipo, Resultados y Código y notebooks | Explica el proyecto y permite leer las cuatro libretas y descargar las fuentes. |

El botón **AI ANALYTICS**, con la leyenda **Haz clic aquí**, explica valores ya almacenados. No ejecuta el modelo ni
sustituye sus predicciones. En modo `mock` produce una explicación local sin API
externa; en modo `live`, Gemini recibe contexto del servidor. La clave permanece
en el entorno del servidor, nunca en `public/` ni en los archivos versionados.

## Explorar parcelas como tabla

En **Parcelas** puedes filtrar por estado, municipio, conjunto (todas,
entrenamiento OOF o predicción final), búsqueda por ID/municipio/estado,
disponibilidad de dato y valor mínimo/máximo. **Datos a consultar** alterna capas temáticas y resultados:
elige capa y periodo del insumo, o conjunto/modelo y métrica. Estos controles
comparten el estado con el mapa en ambos sentidos. La elevación seleccionada al
iniciar también aparece en la tabla. El rendimiento sigue siendo cerrado: el
selector de periodo solo corresponde a los insumos de una capa.

Los extremos del rango son inclusivos y se aplican a la capa o métrica elegida,
no al rendimiento si se está consultando elevación. Un cero real pasa el filtro
«Con dato»; un ausente no pasa un rango numérico. Cambiar de capa, fuente o métrica
limpia los extremos para evitar aplicar una escala de metros a valores en t/ha.
Cambiar solo el periodo conserva los extremos para comparar el mismo insumo.

Pulsa los encabezados para ordenar de forma ascendente o descendente; los
valores ausentes quedan al final en ambos casos. Una celda vacía se representa
con «—», sin convertirse en cero. Al pulsar el ID se abre una ficha con los
valores existentes y las variables del modelo dentro de Parcelas. **Ver en el
mapa y abrir dashboard** es la acción explícita para cambiar de vista.
**Descargar tabla CSV** exporta las filas filtradas en el orden actual y la capa
o métrica elegida, con su unidad y periodo en el encabezado; conserva los vacíos e
incluye la columna de estado.

**Limpiar filtros de parcelas** restablece población, estado, municipio, búsqueda,
disponibilidad y rango;
conserva la capa o métrica seleccionada. Fondo satelital/calles, opacidad,
contornos y límites administrativos son ajustes visuales del mapa: no filtran
filas ni modifican mediciones, por lo que no son controles de la tabla.

## Documentación y notebooks

La entrada de Documentación explica qué contiene y ofrece cuatro apartados:

- **Acerca del reto:** problema, datos y alcance del análisis según el material recibido.
- **Acerca del equipo:** áreas de trabajo. Los nombres y créditos individuales
  quedan pendientes de que el equipo los comparta; el reporte recibido usa «Person».
- **Resultados:** diferencias entre las 138 referencias OOF y las 59 predicciones
  finales, limitaciones y descargas de los CSV originales.
- **Código y notebooks:** cuatro libretas en orden, código de importación y de la
  aplicación, reporte y acceso al repositorio completo.

El visor muestra explicaciones, todas las celdas de código y salidas guardadas
de texto e imágenes PNG/JPEG. No ejecuta notebooks ni entrena modelos. Omite
salidas HTML/JavaScript/SVG y escapa texto antes de insertarlo en la página.
Los notebooks `.ipynb` descargados conservan exactamente los bytes originales.
Para repetir una corrida hacen falta también el dataset original, los rásteres
y el entorno que las libretas utilizan; ver una salida guardada no verifica su
reproducibilidad ni recalcula las métricas.

Para incorporar otra libreta:

1. Guarda el `.ipynb` en `modelos/libretas_finales/`.
2. Añade `id` único, `archivo`, `titulo` y `descripcion` en la lista `notebooks`
   de [modelos/documentacion.json](modelos/documentacion.json), en el orden de lectura.
3. Reinicia el servidor y ejecuta la verificación de API y presentación,
   ajustando el recuento esperado de libretas si se añade una quinta.

`GET /api/documentacion` entrega el catálogo;
`GET /api/documentacion/notebooks/:id` entrega las celdas para lectura, y
`GET /documentacion/archivos/:id` descarga los originales. Solo se sirven IDs
registrados: estas rutas no aceptan una ruta arbitraria del sistema de archivos.
El contenido del reto/equipo/resultados está en `public/index.html`; el catálogo
de libretas y fuentes está separado para ampliarlo sin cambiar el visor.

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

El contexto geográfico se muestra desde el inicio. Hidalgo, Puebla y Tlaxcala
tienen tonos distintos; solo los **nueve municipios con parcelas** son botones
geográficos. Pasar el cursor ilumina su polígono y muestra nombre, estado y número
total de parcelas. Clic, Enter o Espacio seleccionan el municipio, sincronizan los
filtros y acercan el mapa. Un clic posterior en una parcela hace un segundo zoom
animado y abre su dashboard. El botón **Ver región** quita estado, municipio y
búsqueda, conservando el resto de los filtros.

En **Capas y resultados → Estados y municipios seleccionados**, una casilla
activa u oculta contexto, navegación municipal y desenfoque con un clic. Los
polígonos administrativos se dibujan debajo de las parcelas, de modo que no
interceptan sus clics. El archivo se carga una vez y se reutiliza al alternar.
Fuera de los nueve municipios, una máscara con `backdrop-filter` desenfoca y
atenúa el fondo; las parcelas y los controles permanecen nítidos. Si un navegador
no admite desenfoque, conserva la atenuación. Este efecto es visual: no cambia
geometrías, resultados ni disponibilidad del dato.

La selección y los colores se editan en `public/config.js`:

| Municipio | Clave INEGI (`CVEGEO`) |
| --- | --- |
| Almoloya | `13007` |
| Apan | `13008` |
| Cuautepec de Hinojosa | `13016` |
| Emiliano Zapata, Hidalgo | `13021` |
| Singuilucan | `13057` |
| Tepeapulco | `13061` |
| Chignahuapan | `21053` |
| Calpulalpan | `29006` |
| Nanacamilpa de Mariano Arista | `29021` |

Se usan claves, no solo nombres: también existe Emiliano Zapata en Tlaxcala
(`29046`), que no pertenece a esta selección. `zoomMunicipio`, `zoomParcela` y
`duracionZoom` ajustan la animación. Se detiene un vuelo anterior al elegir otra
parcela; «movimiento reducido» del sistema sustituye el vuelo por encuadre sin
animación. `zoomEtiquetasMax` controla cuándo se ocultan los nombres geográficos:
desde **zoom 14** se cierran y desvinculan sus tooltips durante el vuelo y no
reaparecen al pasar el cursor o enfocar con teclado. Se restauran al alejarse por
debajo del umbral. La esquina norte de `limites` pasa de 20.04 a **20.14**, porque los
polígonos completos de Singuilucan y Cuautepec rebasan el límite anterior.

La copia local está en `public/geografia/limites.geojson`: tres estados (Hidalgo,
Puebla y Tlaxcala) y 169 municipios cuyos rectángulos envolventes intersectaban la
región usada al preparar el archivo. Contiene los nueve municipios del conjunto agrícola. Los
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
ni una delimitación para reasignar municipios a una parcela. Los municipios de las
fichas siguen proviniendo del paquete del modelo. Para el filtro de estado, la
interfaz añade estado y CVEGEO a partir del nombre municipal y del punto de
referencia para desambiguar homónimos; esto no se escribe en SQLite. Se comprobó
la distribución de 100 parcelas en Puebla, 51 en Hidalgo y 46 en Tlaxcala.
Si amplías la región del mapa,
comprueba también la cobertura de este archivo.

## Ilustración de selección y GIF pendiente

Antes de seleccionar una parcela, la ficha muestra «Selecciona una parcela» y
una ilustración SVG con animación CSS. El GIF definitivo sigue pendiente de
elección. Para incorporarlo, guarda el archivo en `public/media/` y cambia
`gifSeleccionParcela` en `public/config.js` de `null` a una ruta como
`'media/seleccion-parcela.gif'`. Si no carga, se conserva la ilustración. Cuando
el sistema solicita movimiento reducido se usa la ilustración estática.

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
