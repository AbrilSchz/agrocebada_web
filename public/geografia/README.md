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
