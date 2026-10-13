// Configuración del front. Para capas raster (NIR/satelital propias, p. ej. de un servidor de tiles)
// agrega entradas aquí: { nombre, url: 'https://.../{z}/{x}/{y}.png', attribution }
window.CONFIG = {
  baseInicial: 'sat', // 'sat' = satelital; 'calles' = OpenStreetMap.
  capaInicial: 'final_Elevacion_INEGI_CEM4_120m_mean',
  limitesAdministrativos: 'geografia/limites.geojson',
  // Claves INEGI: evita confundir los dos municipios llamados Emiliano Zapata.
  municipiosSeleccionados: ['13007','13008','13016','13021','13057','13061','21053','29006','29021'],
  estados: {'13':{nombre:'Hidalgo',color:'#65b6ad'},'21':{nombre:'Puebla',color:'#86a8de'},'29':{nombre:'Tlaxcala',color:'#ddb66c'}},
  zoomMunicipio: 12, zoomParcela: 17, duracionZoom: 1.1,
  // Ejemplo al elegir el GIF: 'media/seleccion-parcela.gif'. null muestra la ilustración animada.
  gifSeleccionParcela: null,
  centro: [19.75, -98.4], zoom: 10,
  // Región de navegación aproximada, no límites administrativos.
  // Leaflet usa [latitud, longitud]: esquina suroeste y esquina noreste.
  // Edita estas esquinas y recarga el navegador para probar. Usa null para explorar sin límite.
  // 20.14 permite encuadrar completos Singuilucan y Cuautepec.
  limites: [[18.85, -98.85], [20.14, -97.55]],
  bases: {
    calles: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap' },
    sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Esri, Maxar, Earthstar Geographics' }
  },
  rasters: [] // ej: [{ nombre: 'NIR mensual', url: '...', attribution: '...' }]
};

