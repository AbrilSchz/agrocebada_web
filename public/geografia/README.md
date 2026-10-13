# Límites geoestadísticos locales

`limites.geojson` contiene 3 estados y 169 municipios del Marco Geoestadístico
de INEGI, diciembre de 2025. Consultado el 12 de octubre de 2026.

Servicio y documentación: https://www.inegi.org.mx/servicios/catalogounico.html
Endpoints: `https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/{entidad}` y
`https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgem/{entidad}`, entidades 13, 21 y 29.

Selección municipal por intersección de rectángulos envolventes con
[-98.85, 18.85, -97.55, 20.04]. Polígonos completos, sin recorte. Generalización
Douglas–Peucker de 0.0005 grados y redondeo a seis decimales. El archivo incluye
metadatos y hashes de las seis respuestas originales.

Uso: referencia visual en WGS84 [longitud, latitud]. No reemplaza una
delimitación jurídica ni modifica geometrías, municipios o datos de las parcelas.

La interfaz conserva este archivo íntegro, pero muestra por defecto solo nueve
municipios seleccionados por `CVEGEO` en `public/config.js`. El contexto exterior
se desenfoca; cambiar esta selección no elimina geometrías del archivo. Las
parcelas usan el municipio recibido del modelo; el estado/CVEGEO para filtros se
añade en memoria a partir de ese nombre y del punto de referencia cuando hay
homónimos (Emiliano Zapata en Hidalgo y Tlaxcala).

La navegación amplía su borde norte a 20.14 para encuadrar los municipios completos
de Singuilucan y Cuautepec, ya incluidos en la copia original. No se regeneró ni
se modificó el GeoJSON por este ajuste.
