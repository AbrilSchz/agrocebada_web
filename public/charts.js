(() => {
  const P=window.PRESENTATION,valid=P.hasNumber;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=2)=>Number(v).toFixed(d),signed=(v,d=2)=>(Number(v)>0 ? '+' : '')+fmt(v,d);
  const svg=(content,height,label)=>`<svg class="data-chart" viewBox="0 0 520 ${height}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${content}</svg>`;
  const defs=kind=>`<defs><linearGradient id="${kind}-green" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5cbfab"/><stop offset="1" stop-color="#227d71"/></linearGradient><linearGradient id="${kind}-blue" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#91b2de"/><stop offset="1" stop-color="#506eaa"/></linearGradient></defs>`;
  function yieldChart(data) {
    const unit=data.unidad_rendimiento,rows=[['Predicción',data.resultado.prediccion,'green'],['Observado',data.resultado.observado,'blue']].filter(([,v])=>valid(v));
    if(!rows.length) return '';
    const lower=Math.min(0,...rows.map(([,v])=>Number(v)*1.15)),upper=Math.max(1,...rows.map(([,v])=>Number(v)*1.2));
    const y=v=>218-(Number(v)-lower)/(upper-lower)*174,zero=y(0);
    let content=defs('yield')+`<text class="axis-unit" x="24" y="22">${esc(unit)}</text>`;
    for(let i=0;i<=4;i++) {
      const v=lower+(upper-lower)*i/4;
      content+=`<line class="chart-grid" x1="60" y1="${y(v)}" x2="500" y2="${y(v)}"/><text class="axis-label" x="48" y="${y(v)+5}" text-anchor="end">${fmt(v,1)}</text>`;
    }
    content+=`<line class="chart-zero" x1="60" y1="${zero}" x2="500" y2="${zero}"/>`;
    rows.forEach(([label,value,fill],i)=>{
      const x=rows.length===1 ? 280 : 185+i*190,top=Math.min(zero,y(value)),height=Math.abs(zero-y(value));
      content+=`<rect class="bar-track" x="${x-48}" y="44" width="96" height="174" rx="12"/><rect class="chart-bar" x="${x-48}" y="${top}" width="96" height="${height}" rx="9" fill="url(#yield-${fill})"><title>${esc(label)}: ${fmt(value,3)} ${esc(unit)}</title></rect><text class="bar-value" x="${x}" y="${top-12}" text-anchor="middle">${fmt(value,3)}</text><text class="bar-label" x="${x}" y="250" text-anchor="middle">${label}</text>`;
    });
    return svg(content,276,rows.map(([label,v])=>`${label}: ${fmt(v,3)} ${unit}`).join('. '));
  }
  function errorChart(data) {
    const value=data.metricas?.error_firmado_t_ha;if(!valid(value)) return '';
    const extent=Math.max(.25,Math.abs(Number(value))*1.35),x=v=>270+200*Number(v)/extent;
    const start=Math.min(270,x(value)),width=Math.abs(x(value)-270);
    let content=defs('error');
    for(const v of [-extent,-extent/2,0,extent/2,extent]) content+=`<line class="chart-grid" x1="${x(v)}" y1="22" x2="${x(v)}" y2="110"/><text class="axis-label" x="${x(v)}" y="137" text-anchor="middle">${fmt(v,2)}</text>`;
    content+=`<rect class="bar-track" x="70" y="47" width="400" height="38" rx="19"/><rect class="chart-bar" x="${start}" y="47" width="${width}" height="38" rx="8" fill="url(#error-${value<0 ? 'green' : 'blue'})"><title>Error firmado: ${signed(value,3)} ${esc(data.unidad_rendimiento)}</title></rect><line class="chart-zero" x1="270" y1="23" x2="270" y2="110"/><circle cx="${x(value)}" cy="66" r="6" fill="#244e61" stroke="#fff" stroke-width="2"/>`;
    return `<div class="chart-stat"><strong>${signed(value,3)} <small>${esc(data.unidad_rendimiento)}</small></strong><span>${value<0 ? 'Subestimación' : value>0 ? 'Sobreestimación' : 'Coincide con el observado'} · predicción menos observado</span></div>`+svg(content,160,'Error firmado '+signed(value,3)+' '+data.unidad_rendimiento);
  }
  function wrap(text,width=30) {
    const lines=[];let current='';
    for(const word of text.split(' ')) {if(current && (current+' '+word).length>width) {lines.push(current);current=word;}else current+=(current ? ' ' : '')+word;}
    if(current) lines.push(current);return lines;
  }
  function contributionsChart(rows,unit) {
    rows=rows.filter(c=>valid(c.aporte_t_ha));if(!rows.length) return '';
    const max=Math.max(.01,...rows.map(c=>Math.abs(Number(c.aporte_t_ha)))),zero=378,plotWidth=98;
    let y=16,content=defs('shap');
    rows.forEach(c=>{
      const name=P.variable(c.variable),lines=wrap(name),height=Math.max(68,lines.length*19+27),width=Math.abs(c.aporte_t_ha)/max*plotWidth;
      content+=`<g><title>${esc(name)}: ${signed(c.aporte_t_ha)} ${esc(unit)}</title>${lines.map((line,i)=>`<text class="shap-label" x="16" y="${y+26+i*19}">${esc(line)}</text>`).join('')}<line class="chart-grid" x1="268" y1="${y+42}" x2="488" y2="${y+42}"/><rect class="chart-bar" x="${c.aporte_t_ha>=0 ? zero : zero-width}" y="${y+18}" width="${width}" height="28" rx="6" fill="url(#shap-${c.aporte_t_ha>=0 ? 'green' : 'blue'})"/><text class="shap-value" x="${zero}" y="${y+10}" text-anchor="middle">${signed(c.aporte_t_ha)}</text></g>`;
      y+=height;
    });
    content+=`<line class="chart-zero" x1="${zero}" y1="18" x2="${zero}" y2="${y-12}"/><text class="axis-label" x="${zero-plotWidth}" y="${y+14}" text-anchor="middle">${fmt(-max)}</text><text class="axis-label" x="${zero}" y="${y+14}" text-anchor="middle">0</text><text class="axis-label" x="${zero+plotWidth}" y="${y+14}" text-anchor="middle">${fmt(max)}</text><text class="axis-unit" x="${zero}" y="${y+38}" text-anchor="middle">Aporte (${esc(unit)})</text>`;
    return svg(content,y+55,'Aportes a la salida del modelo; positivo aumenta la salida y negativo la reduce.');
  }
  function validation(rows) {
    const max=Math.max(.001,...rows.flatMap(r=>[r.MAE_pooled,r.RMSE_pooled]).filter(valid).map(Number));
    return `<div class="validation-cards">${rows.map((r,i)=>`<article class="validation-card validation-color-${i%3}"><span class="eyebrow">${esc(P.scheme(r.esquema))}</span>${[['MAE',r.MAE_pooled],['RMSE',r.RMSE_pooled]].filter(([,v])=>valid(v)).map(([name,value])=>`<div class="validation-measure"><span>${name}</span><strong>${fmt(value,3)} <small>t/ha</small></strong></div><div class="validation-track" aria-hidden="true"><span style="width:${Number(value)/max*100}%"></span></div>`).join('')}${valid(r.R2_pooled) ? `<p>R² <strong>${fmt(r.R2_pooled,3)}</strong></p>` : ''}</article>`).join('')}</div><p class="chart-footnote">MAE y RMSE comparten la misma escala entre tarjetas. Menor error es mejor; estas métricas evalúan el modelo en el conjunto, no una parcela.</p>`;
  }
  function importances(rows) {
    const max=Math.max(.001,...rows.map(r=>Number(r.shap_media)));
    return `<div class="importance-list">${rows.map((r,i)=>`<div class="importance-row"><div class="importance-heading"><span class="importance-rank">${i+1}</span><span title="${esc(r.variable)}">${esc(P.variable(r.variable))}</span><strong>${fmt(r.shap_media,3)}</strong></div><div class="importance-track" aria-hidden="true"><div class="importance-color-${i%3}" style="width:${100*r.shap_media/max}%"></div></div><small>${fmt(r.shap_media,3)} ± ${fmt(r.shap_sd,3)} t/ha · variabilidad entre folds</small></div>`).join('')}</div>`;
  }
  window.CHARTS={yield:yieldChart,error:errorChart,contributions:contributionsChart,validation,importances};
})();
