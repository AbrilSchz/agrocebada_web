# Fruticebada - Dashboard de rendimiento y contexto espacial

Plataforma interactiva para explorar las 197 parcelas del Reto AgroCebada FIRA 2026 y los resultados del modelo predictivo integrado en `Libretas_finales.zip`.
El mapa abre en vista **Satelital**. El rendimiento mostrado es un resultado cerrado en **toneladas por hectarea (t/ha)**: no es una serie anual ni una sucesion de campanas. Las fechas de abril-octubre de 2025 corresponden a la ventana temporal de los insumos satelitales y climaticos, no a varios rendimientos de la misma parcela.

## Espacio de trabajo Fruticebada

En escritorio, a partir de 981 px de ancho, el mapa ocupa **65 %** y la columna de asistente y resultados **35 %**. El asistente esta abierto al entrar, sin activar el microfono, pedir al modelo una respuesta ni enfocar el campo de texto. Su boton de plegado libera espacio para la ficha y permite volver a abrirlo. La ficha tiene desplazamiento independiente; el mapa y el asistente permanecen a mano mientras se consultan las graficas y las tablas.

La interfaz presenta primero las tarjetas de rendimiento y las graficas, seguidas de componentes, intervalos y referencias. **Interpretar mi parcela** conserva AI ANALYTICS y abre la lectura breve dentro del mismo chat. Se muestra cuando hay una ficha cargada; las pestanas siguen dependiendo de los datos disponibles.

El panel **Capas y resultados** agrupa los filtros y la apariencia del mapa en apartados desplegables. Tiene cierre explicito y un boton para limpiar filtros. Puede usarse junto al chat: no se cierran entre si. La escala permanece abajo a la izquierda del mapa y la busqueda por ID esta en la cabecera.

Al iniciar, la espiga saluda junto a los pasos de **Explora el territorio** y abre el chat existente. Al seleccionar una parcela, se mueve al mapa sin la burbuja de bienvenida; si se cambia a otra vista, permanece flotando y conserva el acceso al chat. Los mensajes continuan usando `POST /api/chat`.

En tablet y movil, mapa, asistente y ficha se apilan para conservar el ancho de lectura. Una barra ofrece accesos a **Mapa**, **Resultados** y **Asistente**. En las vistas de tabla y documentacion, el chat se convierte en una ventana flotante conservando la conversacion; al volver al mapa se reintegra en su columna. El teclado, los indicadores de foco y la preferencia de movimiento reducido continuan disponibles.

`public/workspace.css`, cargado despues de `style.css`, contiene el layout y la identidad visual. La marca visible, el nombre de la aplicacion npm y la descarga de la tabla usan Fruticebada. Se conservan `agrocebada-final`, los IDs `AGC_*`, la URL del repositorio y los nombres originales del reporte y notebooks para mantener compatibles las fuentes y consultas existentes. La etiqueta del conjunto se actualiza al servirla; no se modifica SQLite para cambiar la marca.

Al iniciar, **Elevacion** ya esta seleccionada sobre el fondo satelital. El boton **Parcelas de validacion**, a la izquierda de Capas y resultados, conserva su nombre activado o desactivado y alterna entre las 59 parcelas de prediccion final y las 197 parcelas completas. Esas 59 no tienen rendimiento observado: constituyen el conjunto de evaluacion ciega del reto. La busqueda de una referencia que quedo fuera del filtro vuelve a mostrar todas para poder seleccionarla.

**Capas y resultados** reune el coloreado tematico y las metricas del modelo en un panel. **Colorear por** elige la fuente; la escala permanece visible abajo a la izquierda aunque el panel este cerrado. En modo solo contornos mantiene el gradiente con una nota que indica que no hay coloreado tematico. La navegacion principal contiene Mapa, Parcelas y Documentacion; la API sigue disponible para la aplicacion, sin un boton adicional en el menu.

Las graficas de rendimiento, error y aportes son SVG vectoriales, con etiquetas, unidades y colores consistentes. La evaluacion del modelo anade tarjetas MAE/RMSE con la misma escala entre esquemas, conservando las metricas tabulares. La grafica de una prediccion final no anade una barra de observado inexistente.

Los contornos geograficos usan `vector-effect: non-scaling-stroke`: su grosor se mantiene en pixeles de pantalla durante el vuelo del mapa. El contorno de la parcela seleccionada conserva 3 px; los normales, 1.5 px si estan activados.

## Chat y agente de la web

**Tu asistente de campo** esta integrado en la columna derecha. Sus botones rapidos permiten mostrar las 59 parcelas de validacion, elevacion, prediccion, tabla y limpiar filtros; tambien explican OOF y SHAP. Al abrir el chat no se llama al modelo. Los botones envian su instruccion directamente. Enter envia y Shift+Enter anade un salto de linea. Escape pliega el chat cuando el foco esta dentro de el; en su ventana flotante tambien lo cierra. Al pasar a tabla o documentacion, el chat sigue abierto y un boton flotante permite reabrirlo.

Puedes pedir, por ejemplo, «selecciona la parcela AGC_003», «muestra la elevacion» o «abre la tabla de parcelas». Estos atajos exactos funcionan sin Gemini, incluso en modo mock. Las peticiones naturales mas complejas usan *function calling*: Gemini elige una funcion y sus argumentos; el servidor los valida y el navegador los aplica mediante los mismos controles del dashboard. No se ejecuta codigo propuesto por el modelo ni se modifica SQLite.

| Accion permitida | Comportamiento |
| --- | --- |
| Seleccionar parcela | Busca el ID real, abre su ficha y anima el zoom; limpia filtros que la oculten. |
| Mostrar capa | Selecciona una capa existente y, si se pide, una fecha real de sus insumos. |
| Mostrar resultados | Prediccion, observado o errores almacenados; no inventa errores para las finales. |
| Filtrar parcelas | Conjunto, estado, municipio, busqueda, disponibilidad y rango del valor mostrado; se comparte con la tabla. |
| Navegar | Mapa, tabla, documentacion o vista regional. |
| Mostrar limites | Activa o desactiva la division de estados y municipios. |
| Consultar otra parcela | El servidor lee su ficha para responder sin cambiar la seleccion. |

El catalogo de parcelas, capas y fechas se obtiene de SQLite; los estados admitidos corresponden al area de estudio (Hidalgo, Puebla y Tlaxcala). Cada turno acepta hasta cuatro acciones o consultas y como maximo dos llamadas al modelo. La primera propone funciones; la segunda recibe datos o acciones preparadas y redacta la respuesta. Las acciones se despachan al navegador despues de completar el turno; las cargas posteriores conservan sus indicadores y errores habituales. No se reemplaza una seleccion de parcelas finales por referencias automaticamente para mostrar errores. La interfaz indica las acciones enviadas.

Sin parcela seleccionada, la conversacion usa el conjunto completo, aunque haya filtros en pantalla. Con una parcela usa su resultado y contexto. Al cambiar la seleccion manualmente se cancela la respuesta pendiente y se reinicia el historial; una seleccion hecha por el propio agente conserva ese turno con el nuevo contexto. Los resultados verificados proceden del servidor, no del historial o de cifras aportadas por el navegador. Las respuestas se insertan como texto, sin ejecutar HTML.

**AI ANALYTICS** abre el mismo chat con un parrafo de interpretacion breve: una implicacion y una limitacion relevantes, sin repetir los numeros o tarjetas. Puedes continuar con preguntas sobre esa lectura. En modo mock es una explicacion local identificada como tal; los datos agricolas siguen siendo los oficiales.

### Comandos por voz

Pulsa el boton de microfono, concede permiso y habla; pulsa el boton de detencion para finalizar y enviar. La grabacion termina automaticamente a los 20 segundos. Se admite hasta 1 MiB de audio WebM, OGG, MP4/M4A o WAV. El audio viaja al servidor y a Google para una transcripcion literal; la frase reconocida aparece como mensaje tuyo y sigue el mismo flujo del agente. La aplicacion no guarda audio en disco, SQLite o historial. Cerrar/reiniciar el chat o cambiar de parcela cancela la captura y libera el microfono.

La voz requiere HTTPS (o localhost), permiso del usuario, MediaRecorder compatible y Gemini activo en el servidor. Se detectan capacidades, sin depender de SpeechRecognition; esto permite usar navegadores que graban audio pero no ofrecen reconocimiento nativo. Si falta permiso o la IA esta desactivada, aparece un mensaje y puedes escribir o utilizar los botones. No se activa el microfono al abrir la web.

### Configuracion y contrato

En Render usa **`LLM_MODE=live`**, **`GEMINI_API_KEY`** y el modelo configurado en `GEMINI_MODEL`, compatible con texto, audio y funciones. `LLM_MODE=mock` permite probar respuestas locales y acciones exactas sin llamar al proveedor. La clave permanece en el servidor; no llega al JavaScript publico.

- `POST /api/chat`: `message` (1-1500 caracteres), `history` (hasta seis pares user/assistant, 2000 caracteres por mensaje y 12000 en total), `ID_POLIGONO` opcional, `campana`, `version_modelo` y `ui` opcional (vista/capa/metrica/filtros). `ui` describe preferencias de pantalla; no sustituye datos reales. Responde con `reply`, `mode` (`live`, `mock` o `local`), `actions` y `context`.
- `GET /api/chat/config`: informa si la voz esta habilitada, sin exponer la clave.
- `POST /api/chat/voz`: `mimeType` y `audio` base64; devuelve `transcript`.
- `POST /api/parcelas/:id/informacion-inteligente`: devuelve la interpretacion breve.

El historial reciente se envia en cada turno; no se persiste en el navegador ni SQLite. Chat, interpretacion y voz comparten 12 solicitudes por IP/minuto. Cada llamada real, incluida transcripcion y segundo paso del agente, cuenta para el limite de 60 llamadas/hora y 2 simultaneas. La cache de respuestas dura 15 minutos (hasta 100 entradas); el audio no se cachea. Cada llamada tiene un timeout de 15 s.

Las pestanas y tarjetas aparecen solo cuando sus datos existen. Las referencias OOF conservan Errores; las predicciones finales lo ocultan. Aportes se muestra cuando existen contribuciones completas o los tres aportes principales del HGB. Las tablas vacias se omiten. Al cambiar de parcela, una pestana que deja de estar disponible vuelve automaticamente a la primera pestana con datos.

Las variables se presentan con nombres legibles (por ejemplo, **Precipitacion - mayo 2025**). Sus identificadores originales siguen en los CSV y aparecen al pasar sobre el nombre. La tabla de variables muestra solamente valores presentes; los datos originales conservan sus ausencias.

## Que muestra cada parte del dashboard

| Vista | Datos mostrados | Interpretacion |
| --- | --- | --- |
| Rendimiento | Prediccion y observado cuando existe | Compara dos valores de la misma parcela; sin eje de anos. |
| Errores | Prediccion menos observado, magnitud y porcentaje | Solo disponibles en las 138 parcelas con observado. |
| Aportes | Tres SHAP locales redondeados | Explican los factores principales del componente **HGB final**. |
| Modelo | Tres esquemas de validacion, OOF por parcela e importancia global | Distingue evaluacion del modelo, error individual y media de SHAP absoluto. |
| Contexto | Municipio, componentes KNN/HGB, intervalo empirico y vecinos | Intervalos y vecinos cercanos disponibles para las 59 parcelas de prediccion. |
| Capas | PREC, Tmax y Tmin mensuales; elevacion y pendiente | Cinco capas ambientales con unidad, fuente y agregacion separadas. |
| Resultados | Coloreado por prediccion, observado o error | Gris significa ausencia de dato; no significa rendimiento cero. |
| Parcelas | Tabla con filtros, valores, ordenacion y ficha dentro de la vista | Comparte la seleccion del mapa y permite trabajar sin abrirlo. |
| Documentacion | Reto, Equipo, Resultados y Codigo y notebooks | Explica el proyecto y permite leer las cuatro libretas y descargar las fuentes. |

El boton **AI ANALYTICS**, con la leyenda **Haz clic aqui**, interpreta los valores almacenados de la parcela seleccionada. No reentrena el modelo ni sustituye sus predicciones. En modo `mock` produce una explicacion local sin API externa; en modo `live`, Gemini recibe contexto validado del servidor.

## Explorar parcelas como tabla

En **Parcelas** puedes filtrar por estado, municipio, conjunto (todas, entrenamiento OOF o prediccion final), busqueda por ID/municipio/estado, disponibilidad de dato y valor minimo/maximo. **Datos a consultar** alterna capas tematicas y resultados: elige capa y periodo del insumo, o conjunto/modelo y metrica. Estos controles comparten el estado con el mapa en ambos sentidos. La elevacion seleccionada al iniciar tambien aparece en la tabla. El rendimiento sigue siendo cerrado: el selector de periodo solo corresponde a los insumos de una capa.

Los extremos del rango son inclusivos y se aplican a la capa o metrica elegida, no al rendimiento si se esta consultando elevacion. Un cero real pasa el filtro «Con dato»; un ausente no pasa un rango numerico. Cambiar de capa, fuente o metrica limpia los extremos para evitar aplicar una escala de metros a valores en t/ha. Cambiar solo el periodo conserva los extremos para comparar el mismo insumo.

Pulsa los encabezados para ordenar de forma ascendente o descendente; los valores ausentes quedan al final en ambos casos. Una celda vacia se representa con «—», sin convertirse en cero. Al pulsar el ID se abre una ficha con los valores existentes y las variables del modelo dentro de Parcelas. **Ver en el mapa y abrir dashboard** es la accion explicita para cambiar de vista. **Descargar tabla CSV** exporta las filas filtradas en el orden actual y la capa o metrica elegida, con su unidad y periodo en el encabezado; conserva los vacios e incluye la columna de estado.

**Limpiar filtros de parcelas** restablece poblacion, estado, municipio, busqueda, disponibilidad y rango; conserva la capa o metrica seleccionada. Fondo satelital/calles, opacidad, contornos y limites administrativos son ajustes visuales del mapa: no filtran filas ni modifican mediciones, por lo que no son controles de la tabla.

## Documentacion y notebooks

La entrada de Documentacion ofrece cuatro apartados:

- **Acerca del reto:** problema, datos y alcance del analisis para el ciclo agricola 2025.
- **Acerca del equipo:** autoria y areas de desarrollo tecnico del proyecto.
- **Resultados:** desempeno en las 138 referencias OOF y caracteristicas de las 59 predicciones finales, alcances metodologicos y descargas de los CSV generados.
- **Codigo y notebooks:** las cuatro libretas en orden secuencial, codigo de importacion y de la aplicacion, reporte metodologico y acceso al repositorio completo.

El visor muestra explicaciones, todas las celdas de codigo y salidas guardadas de texto e imagenes PNG/JPEG. No ejecuta notebooks en vivo durante la navegacion web. Omite salidas HTML/JavaScript/SVG arbitrarias y escapa texto antes de insertarlo en la pagina. Los notebooks `.ipynb` descargados conservan exactamente su estructura original.

Para incorporar otra libreta:

1. Guarda el `.ipynb` en `modelos/libretas_finales/`.
2. Anade `id` unico, `archivo`, `titulo` y `descripcion` en la lista `notebooks` de [modelos/documentacion.json](modelos/documentacion.json), en el orden de lectura.
3. Reinicia el servidor y ejecuta la verificacion de API y presentacion, ajustando el recuento esperado de libretas si se anade una quinta.

`GET /api/documentacion` entrega el catalogo; `GET /api/documentacion/notebooks/:id` entrega las celdas para lectura, y `GET /documentacion/archivos/:id` descarga los originales. Solo se sirven IDs registrados: estas rutas no aceptan una ruta arbitraria del sistema de archivos.

## Fuente y poblacion

Las fuentes del modelo se encuentran en [modelos/libretas_finales](modelos/libretas_finales/): cuatro notebooks reproducibles, el reporte metodologico DOCX, tablas CSV, resumenes JSON e imagenes de diagnostico.

| Cohorte | Parcelas | Prediccion usada en la ficha | Observado |
| --- | ---: | --- | --- |
| Referencia (Entrenamiento) | 138 | `RepeatedKFold__Ensamble_50_50` del CSV OOF, promedio de tres repeticiones | `RENDIMIENTO_T_HA` oficial |
| Prediccion final (Evaluacion) | 59 | `RENDIMIENTO_T_HA_PRED` del dashboard final, con precision original | Ausente (`NULL`) |
| Total | 197 | OOF y final se identifican por separado | 138 valores reales |

Todas se relacionan por **ID_POLIGONO**, conservando sus identificadores exactos `AGC_001`, etc. Los 197 IDs coinciden con las geometrias espaciales. No se usa orden de filas para relacionar datos ni se convierte ausencia en cero.

El conjunto abarca nueve municipios: Chignahuapan (100), Calpulalpan (44), Singuilucan (23), Almoloya (14), Cuautepec de Hinojosa (9), Emiliano Zapata (3), Nanacamilpa de Mariano Arista (2), Apan (1) y Tepeapulco (1). La distribucion por estado es Puebla 100, Hidalgo 51 y Tlaxcala 46. **No se dispone de un identificador de productor ni variables discretas de manejo agricola**: pertenecer al mismo municipio refleja proximidad geografica y ambiental, pero no implica el mismo manejo agricola a nivel de lote.

### Archivos que alimentan cada resultado

| Archivo dentro de `Data/` | Contenido | Uso |
| --- | --- | --- |
| `05_final/dashboard_parcelas_referencia.csv` | 138 IDs, observado, municipio y centroide | Cohorte de referencia y contexto |
| `05_final/dashboard_parcelas_prediccion.csv` | 59 predicciones, componentes, intervalos, vecinos y SHAP top 3 | Ficha de prediccion final |
| `05_final/predicciones_59_ensamble.csv` | 59 predicciones redondeadas a cuatro decimales | Entregable de predicciones; verificado contra el dashboard |
| `03_validacion/predicciones_oof_todos_esquemas.csv` | 138 filas; cinco modelos y tres esquemas | Prediccion OOF de cada referencia |
| `03_validacion/resultados_validacion.csv` | 15 combinaciones de esquema y modelo | Metricas globales del reporte y dashboard |
| `03_validacion/resultados_por_fold.csv` | 145 filas | Verificacion de medias y desviaciones por fold |
| `03_validacion/metadatos_espaciales_validacion.csv` | 138 IDs, estado, municipio, celda CHIRPS y centroide | Metadatos de validacion espacial |
| `02_fenologia/X_integrado_completo.csv` | 197 filas y 187 variables | Consulta de variables; capas de clima y topografia |
| `04_shap/importancia_variables.csv` | 187 importancias globales | Diez variables principales en Modelo |
| `04_shap/resumen_libreta04.json` | Cuantiles de error y umbral de distancia | Verificacion de intervalos empiricos |

Los demas CSV y JSON de calidad, fenologia, ablacion, permutacion, diferencias pareadas y preguntas guia se incluyen para trazabilidad completa del flujo analitico.

## Modelo e interpretacion

El ensamble final combina **50 % KNN espacial + 50 % HistGradientBoosting (HGB)**. El importador comprueba esa identidad matematica para las predicciones finales y para los tres esquemas OOF.

Las libretas implementan KNN con cinco vecinos y pesos inversos a la distancia sobre coordenadas escaladas, y HGB final con seleccion de 20 variables mediante informacion mutua (`SelectKBest`) y coordenadas forzadas. La seleccion e imputacion por mediana se ajustan dentro del pipeline de cada fold de entrenamiento. El HGB agronomico utilizado para responder las preguntas guia y evaluar la importancia global de variables es un modelo independiente entrenado **sin coordenadas explicitas**.

### OOF: validacion fuera del entrenamiento de cada fold

Una prediccion OOF (*out-of-fold*) se calcula para una parcela cuando queda fuera del entrenamiento del fold correspondiente. Para las 138 referencias, la ficha muestra el promedio de las tres repeticiones OOF de `RepeatedKFold`.

La pestana Modelo tambien permite comparar las predicciones OOF de los otros dos esquemas (`GroupKFold_CHIRPS` y `LOGO_Municipio`) para la misma parcela. Las 59 predicciones finales provienen del modelo ajustado con las 138 referencias completas.

### Validacion global reportada

Valores del **Ensamble_50_50** en `resultados_validacion.csv`:

| Esquema | Folds | MAE pooled (t/ha) | RMSE pooled (t/ha) | R2 pooled | MAE por fold +/- DE (t/ha) |
| --- | ---: | ---: | ---: | ---: | ---: |
| RepeatedKFold | 15: 5 x 3 repeticiones | 0.3733 | 0.5212 | 0.6218 | 0.3731 +/- 0.0718 |
| GroupKFold_CHIRPS | 5 | 0.4974 | 0.6328 | 0.4433 | 0.4804 +/- 0.1481 |
| LOGO_Municipio | 9 | 0.4817 | 0.7073 | 0.3045 | 0.5230 +/- 0.4238 |

- **RepeatedKFold** intercala parcelas; evalua la capacidad de interpolacion dentro de zonas con cobertura de referencias.
- **GroupKFold_CHIRPS** mantiene separados los grupos de celdas climaticas (~0.05 grados).
- **LOGO_Municipio** deja un municipio completo fuera del entrenamiento en cada iteracion para medir extrapolacion geografica.

**Pooled** calcula metricas sobre el conjunto de parcelas. **Media por fold** otorga el mismo peso a cada particion (en LOGO, a cada municipio, independientemente de su numero de predios). La desviacion estandar (DE) mide la variabilidad entre folds.

El error firmado individual es `prediccion - observado`; el absoluto es su magnitud; el relativo es `100 x |error| / |observado|`.

### Intervalos empiricos nominales al 80 %

Para las 59 predicciones finales se calculan intervalos empiricos basados en los cuantiles de error fuera de muestra:

- Con referencias cercanas: prediccion +/- **0.5676 t/ha**.
- Sin referencias cercanas: prediccion +/- **0.7596 t/ha**.
- Umbral de proximidad: **2027.23 m**, correspondiente al percentil 95 de la distancia al vecino mas cercano entre las 138 referencias de entrenamiento.

Los semianchos corresponden al percentil 80 de los errores absolutos OOF (`RepeatedKFold` para interpolacion y `LOGO_Municipio` para zonas nuevas). En el conjunto de evaluacion del reto, las **59 parcelas** se encuentran dentro del umbral de cobertura de referencias cercanas (mediana de 400 m al vecino de entrenamiento mas proximo).

Las tres referencias vecinas mostradas en la ficha utilizan distancia **haversine**, en metros, entre centroides para ofrecer contexto geografico directo al usuario.

### SHAP: explicabilidad local y global

La pestana Aportes de las 59 predicciones presenta las **tres variables con mayor contribucion local en el componente HGB final**, expresadas en t/ha. El signo indica el sentido en que cada variable desplaza la estimacion respecto al valor esperado base.

Por su parte, las barras globales en la pestana Modelo representan la **media de |SHAP|** del HGB agronomico a traves de los 15 folds de validacion, junto con su desviacion estandar entre folds, permitiendo identificar los predictores mas consistentes en todo el conjunto de datos.

## Variables, unidades y fechas

Los 187 valores originales pueden consultarse dentro de la pestana Modelo, por parcela. Las libretas los estructuran en ocho bloques: suelo/termico (7), vegetacion (9), agua (3), topografia (2), clima (21), fisica (9), fenologia (135) y area (1).

| Familia | Unidad / agregacion documentada | Como aparece |
| --- | --- | --- |
| `PREC_2025_MM_mean` | mm; media espacial del raster mensual CHIRPS | Capa Precipitacion, siete meses |
| `Tmax_2025_MM_mean`, `Tmin_2025_MM_mean` | °C; media espacial mensual CHIRTS | Dos capas separadas, siete meses |
| `Elevacion_INEGI_CEM4_120m_mean` | m; media espacial | Capa Elevacion estatica |
| `Pendiente_INEGI_CEM4_120m_grados_mean` | grados; media espacial | Capa Pendiente estatica |
| Indices `__mediana` | Mediana temporal de promedios espaciales por captura | Tabla de variables del modelo |
| Fenologia `__auc`, `__p90`, `__iqr`, etc. | Metricas de dinamica temporal definidas en Libreta 02 | Tabla de variables del modelo |
| Fisica / area | Integrales de dosel, balances termico-hidricos y superficie | Tabla de variables del modelo |

El clima mensual se almacena con `AAAA-MM-01` como **identificador del mes**. Elevacion y pendiente usan fecha vacia por ser capas topograficas estaticas. Las colecciones Basico (Sentinel-2 / Landsat) y PRO (Planet) se mantienen diferenciadas en sus nombres de variable.

## Estados y municipios en el mapa

El contexto geografico se muestra desde el inicio. Hidalgo, Puebla y Tlaxcala tienen tonos distintos; los **nueve municipios con parcelas** funcionan como controles geograficos interactivos. Pasar el cursor ilumina su poligono y muestra nombre, estado y numero total de parcelas. Clic, Enter o Espacio seleccionan el municipio, sincronizan los filtros y acercan el mapa. Un clic posterior en una parcela hace un segundo zoom animado y abre su dashboard. El boton **Ver region** limpia los filtros de estado, municipio y busqueda.

En **Capas y resultados -> Estados y municipios seleccionados**, una casilla activa u oculta contexto, navegacion municipal y desenfoque con un clic. Los poligonos administrativos se dibujan debajo de las parcelas para no interceptar sus clics. Fuera de los nueve municipios, una mascara con `backdrop-filter` desenfoca y atenua el fondo manteniendo nitidas las parcelas y los controles.

La seleccion y los colores se configuran en `public/config.js`:

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

Se utilizan claves geoestadisticas completas (`CVEGEO`) para evitar ambiguedades por homonimia municipal. `zoomMunicipio`, `zoomParcela` y `duracionZoom` ajustan la animacion, respetando la preferencia de «movimiento reducido» del sistema operativo.

La capa local se encuentra en `public/geografia/limites.geojson`, elaborada a partir del Marco Geoestadistico de **INEGI**, garantizando operacion autonoma sin depender de servicios externos durante la navegacion.

## Arquitectura y almacenamiento

- `modelos/libretas_finales/`: libretas `.ipynb`, reporte metodologico y tablas generadas por el pipeline cientifico.
- `scripts/importar_libretas.py`: adapta y valida el contrato de datos finales hacia SQLite.
- `scripts/importar_modelo.py`: importador complementario para archivos Excel/ZIP/CSV.
- `db/parcelas_master.sqlite`: base de geometrias y capas base de referencia.
- `db/parcelas_final.sqlite`: base consolidada y versionada para produccion.
- `parcelas_resultados`: resultados con tipo OOF/final y errores precalculados.
- `parcelas_contexto_modelo`: municipio, componentes, vecinos, intervalos y variables.
- `modelo_resumen`: evaluacion global y trazabilidad por conjunto/modelo.
- `modelo_importaciones`: registro de origen, fecha UTC y hashes SHA-256 de verificacion.

El servidor utiliza `DB_PATH` si esta definido; por defecto selecciona `db/parcelas_final.sqlite`.

## Ejecutar localmente

Requisitos: **Node 22+**, npm y **Python 3.10+** (unicamente necesario si se desea ejecutar los scripts de reimportacion o verificacion).

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

El modelado corresponde al ciclo agricola abril-octubre de 2025 sobre 138 parcelas etiquetadas y 59 parcelas de prediccion ciega. La arquitectura combina interpolacion espacial explicita (KNN) y aprendizaje estadistico sobre indicadores fenologicos, climaticos y topograficos (HGB), reportando intervalos de incertidumbre diferenciados por proximidad a parcelas de referencia para respaldar decisiones tecnicas y financieras con rigor metodologico.
