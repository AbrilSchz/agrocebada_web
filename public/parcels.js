// Funciones compartidas por la tabla y el mapa. Los valores ausentes siguen vacíos.
(() => {
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function filter(features, {predictionOnly = false, cohort:population='', state='',municipality='',query='',availability='',minimum='',maximum='',values={}} = {}) {
    const search = normalize(query.trim());
    const selectedCohort=predictionOnly ? 'prediccion' : population;
    return features.filter(f => (!selectedCohort || f.properties.cohorte === selectedCohort) &&
      (!state || f.properties.estado===state) &&
      (!municipality || f.properties.municipio === municipality) &&
      (!search || normalize(`${f.id} ${f.properties.municipio ?? ''} ${f.properties.estado ?? ''}`).includes(search)) &&
      (!availability || (availability==='present' ? numeric(values[f.id]) : !numeric(values[f.id]))) &&
      (!numeric(minimum) || (numeric(values[f.id]) && Number(values[f.id])>=Number(minimum))) &&
      (!numeric(maximum) || (numeric(values[f.id]) && Number(values[f.id])<=Number(maximum))));
  }
  function sort(features, {key = 'id', direction = 'asc', values = {}} = {}) {
    const sign = direction === 'desc' ? -1 : 1;
    return [...features].sort((a, b) => {
      let compared;
      if (key === 'value') {
        const av = values[a.id], bv = values[b.id];
        if (!numeric(av) || !numeric(bv)) return numeric(av) ? -1 : numeric(bv) ? 1 : String(a.id).localeCompare(String(b.id));
        compared = Number(av) - Number(bv);
      } else {
        const av = key === 'id' ? a.id : a.properties[key], bv = key === 'id' ? b.id : b.properties[key];
        compared = String(av ?? '').localeCompare(String(bv ?? ''), 'es', {numeric:true});
      }
      return compared * sign || String(a.id).localeCompare(String(b.id), 'es', {numeric:true});
    });
  }
  const cohort = f => f.properties.cohorte === 'prediccion' ? 'Predicción final' : f.properties.cohorte === 'referencia' ? 'Entrenamiento · OOF' : '';
  function csv(features, values, valueLabel) {
    const cell = value => {
      // Evita que etiquetas de texto se interpreten como fórmulas en Excel.
      const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? "'" + value : String(value ?? '');
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return [['Parcela', 'Estado', 'Municipio', 'Conjunto', valueLabel], ...features.map(f =>
      [f.id, f.properties.estado ?? '',f.properties.municipio ?? '', cohort(f), numeric(values[f.id]) ? Number(values[f.id]) : ''])]
      .map(row => row.map(cell).join(',')).join('\r\n');
  }
  function detail(data) {
    const P = window.PRESENTATION, r = data.resultado, ctx = data.contexto_modelo;
    const rows = [['Predicción',r.prediccion],['Observado',r.observado],
      ['Error firmado',data.metricas?.error_firmado_t_ha],['Error absoluto',data.metricas?.error_absoluto_t_ha]]
      .filter(([,value]) => numeric(value));
    let html = `<div class="detail-heading"><div><span class="eyebrow">FICHA DE PARCELA</span><h2>${escape(data.ID_POLIGONO)}</h2></div><button type="button" data-detail-close aria-label="Cerrar ficha">×</button></div>`;
    html += `<p>${escape(ctx?.municipio ?? '')} · ${r.tipo_prediccion === 'final' ? 'Predicción final' : 'Referencia · OOF'}</p>`;
    html += `<table><caption>Rendimiento cerrado · ${escape(data.unidad_rendimiento)}</caption><tbody>${rows.map(([name,value]) => `<tr><th scope="row">${name}</th><td>${Number(value).toFixed(3)}</td></tr>`).join('')}</tbody></table>`;
    if (ctx?.intervalo_empirico80) html += `<p class="detail-note">Intervalo empírico nominal 80 %: <strong>${Number(ctx.intervalo_empirico80.inferior).toFixed(3)}–${Number(ctx.intervalo_empirico80.superior).toFixed(3)} t/ha</strong>. No garantiza cobertura.</p>`;
    const contributions = ctx?.shap_hgb_parcial || [];
    if (contributions.length) html += `<details><summary>Aportes parciales del HGB</summary><p>Tres valores redondeados; no reconstruyen el ensamble.</p><table><tbody>${contributions.map(c => `<tr><th scope="row" title="${escape(c.variable)}">${escape(P.variable(c.variable))}</th><td>${Number(c.aporte_redondeado_t_ha).toFixed(2)} t/ha</td></tr>`).join('')}</tbody></table></details>`;
    const variables = Object.entries(ctx?.variables_modelo || {}).filter(([,value]) => numeric(value));
    if (variables.length) html += `<details><summary>Variables del modelo (${variables.length})</summary><div class="table-wrap"><table><thead><tr><th>Variable</th><th>Valor</th></tr></thead><tbody>${variables.map(([key,value]) => `<tr><td title="${escape(key)}">${escape(P.variable(key))}</td><td>${Number(value).toFixed(3)} ${escape(P.unit(key))}</td></tr>`).join('')}</tbody></table></div></details>`;
    return html + '<button type="button" class="secondary-button" data-detail-map>Ver en el mapa y abrir dashboard</button>';
  }
  window.PARCELS = {filter, sort, csv, cohort, detail};
})();
