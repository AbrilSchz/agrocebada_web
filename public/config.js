// Configuración del front. Para capas raster (NIR/satelital propias, p. ej. de un servidor de tiles)
// agrega entradas aquí: { nombre, url: 'https://.../{z}/{x}/{y}.png', attribution }
window.CONFIG = {
  centro: [19.75, -98.4], zoom: 10,
  bases: {
    calles: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap' },
    sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Esri, Maxar, Earthstar Geographics' }
  },
  rasters: [] // ej: [{ nombre: 'NIR mensual', url: '...', attribution: '...' }]
};
