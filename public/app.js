const C = window.CONFIG, $ = s => document.querySelector(s);
const map = L.map('map').setView(C.centro, C.zoom);
let base = L.tileLayer(C.bases.calles.url, { attribution: C.bases.calles.attribution, maxZoom: 19 }).addTo(map);
document.querySelectorAll('[name=base]').forEach(r => r.onchange = () => {
  map.removeLayer(base); const b = C.bases[r.value];
  base = L.tileLayer(b.url, { attribution: b.attribution, maxZoom: 19 }).addTo(map).bringToBack();
});

const ramp = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function color(t) {
  t = Math.min(1, Math.max(0, t)) * (ramp.length - 1); const i = Math.min(Math.floor(t), ramp.length - 2), f = t - i;
  const a = hex(ramp[i]), b = hex(ramp[i + 1]); return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f))})`;
}

let geo, capas = [], valores = {}, rango = [0, 1];
const estilo = f => {
  const v = valores[f.id];
  return v === undefined ? { color: '#fff', weight: 1.5, fillColor: '#888', fillOpacity: 0.25 }
    : { color: '#fff', weight: 1, fillColor: color((v - rango[0]) / (rango[1] - rango[0] || 1)), fillOpacity: 0.75 };
};

async function ficha(id, latlng) {
  const d = await (await fetch('/api/parcelas/' + encodeURIComponent(id))).json();
  const filas = d.datos.map(x => `<tr><td>${x.capa || x.capa_id}</td><td>${x.fecha}</td><td>${x.valor?.toFixed(3)}</td></tr>`).join('');
  L.popup({ maxHeight: 260 }).setLatLng(latlng).setContent(`<b>${id}</b><br><table>${filas || '<tr><td>Sin datos aún</td></tr>'}</table>`).openOn(map);
}

async function pintar() {
  const capa = $('#capa').value, fSel = $('#fecha');
  if (!capa) { valores = {}; fSel.hidden = true; $('#leyenda').innerHTML = ''; return geo.setStyle(estilo); }
  if (fSel.dataset.capa !== capa) {
    const fs = await (await fetch(`/api/capas/${capa}/fechas`)).json();
    fSel.innerHTML = fs.map(f => `<option>${f}</option>`).join(''); fSel.value = fs.at(-1); fSel.dataset.capa = capa;
  }
  fSel.hidden = false;
  const r = await (await fetch(`/api/capas/${capa}/valores?fecha=${fSel.value}`)).json();
  valores = r.valores; const c = capas.find(x => x.id === capa);
  const vs = Object.values(valores); rango = [c.min ?? Math.min(...vs), c.max ?? Math.max(...vs)];
  $('#leyenda').innerHTML = `<div class="grad" style="background:linear-gradient(90deg,${ramp})"></div><div class="rango"><span>${rango[0]}</span><span>${rango[1]}</span></div>`;
  geo.setStyle(estilo);
}

async function init() {
  const [fc, cs] = await Promise.all([fetch('/api/parcelas').then(r => r.json()), fetch('/api/capas').then(r => r.json())]);
  capas = cs;
  const grupos = {}; cs.forEach(c => (grupos[c.grupo] ??= []).push(c));
  $('#capa').insertAdjacentHTML('beforeend', Object.entries(grupos).map(([g, l]) =>
    `<optgroup label="${g}">${l.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}</optgroup>`).join(''));
  C.rasters.forEach((r, i) => $('#capa').insertAdjacentHTML('afterend', '')); // reservado para rasters
  geo = L.geoJSON(fc, { style: estilo, onEachFeature: (f, l) => l.on('click', e => ficha(f.id, e.latlng)) }).addTo(map);
  map.fitBounds(geo.getBounds());
  $('#ids').innerHTML = fc.features.map(f => `<option value="${f.id}">`).join('');
  $('#t').innerHTML = '<tr><th>ID_POLIGONO</th><th>Lon ref.</th><th>Lat ref.</th></tr>' +
    fc.features.map(f => `<tr data-id="${f.id}"><td>${f.id}</td><td>${f.properties.longitud_ref.toFixed(5)}</td><td>${f.properties.latitud_ref.toFixed(5)}</td></tr>`).join('');
  $('#t').onclick = e => { const id = e.target.closest('tr')?.dataset.id; if (id) { vista('mapa'); irA(id); } };
}
function irA(id) {
  geo.eachLayer(l => { if (l.feature.id === id) { map.fitBounds(l.getBounds(), { maxZoom: 16 }); ficha(id, l.getBounds().getCenter()); } });
}
$('#buscar').onchange = e => irA(e.target.value.trim());
$('#capa').onchange = $('#fecha').onchange = pintar;

function vista(v) {
  document.querySelectorAll('.vista').forEach(s => s.hidden = s.id !== v);
  document.querySelectorAll('.nav a[data-v]').forEach(a => a.classList.toggle('active', a.dataset.v === v));
  if (v === 'mapa') setTimeout(() => map.invalidateSize(), 0);
}
document.querySelectorAll('.nav a[data-v]').forEach(a => a.onclick = e => { e.preventDefault(); vista(a.dataset.v); });
init();
