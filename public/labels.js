// Etiquetas de presentación: los identificadores originales se conservan en los datos.
window.PRESENTATION = (() => {
  const months=['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const statistics={mediana:'mediana estacional',auc:'integral estacional',delta_max:'cambio máximo',p90:'percentil 90',iqr:'rango intercuartílico',mes_maximo:'mes del máximo'};
  const names={latitud:'Latitud',longitud:'Longitud',Elevacion_INEGI_CEM4_120m_mean:'Elevación',Pendiente_INEGI_CEM4_120m_grados_mean:'Pendiente',AREA_HA:'Superficie de la parcela',area_ha:'Superficie de la parcela'};
  const physical={prec_acum_abr_oct:'Precipitación acumulada · abril–octubre',prec_acum_jul_sep:'Precipitación acumulada · julio–septiembre',tmax_media_abr_oct:'Temperatura máxima media · abril–octubre',tmin_media_abr_oct:'Temperatura mínima media · abril–octubre',amplitud_termica_abr_oct:'Amplitud térmica · abril–octubre',cociente_estres_jul_sep:'Cociente de estrés · julio–septiembre',integral_dosel_fapar:'Integral del dosel · FAPAR',integral_dosel_ndvi:'Integral del dosel · NDVI',mes_pico_ndvi:'Mes del máximo · NDVI'};
  const schemeNames={RepeatedKFold:'Validación repetida · 5 × 3',GroupKFold_CHIRPS:'Validación por celdas climáticas',LOGO_Municipio:'Validación dejando un municipio fuera'};
  function variable(key) {
    if(names[key]) return names[key];
    const climate=/^(PREC|Tmax|Tmin)_2025_(\d{2})_mean$/.exec(key);
    if(climate) return `${({PREC:'Precipitación',Tmax:'Temperatura máxima',Tmin:'Temperatura mínima'})[climate[1]]} · ${months[Number(climate[2])]} 2025`;
    if(key.startsWith('fisica__')) return physical[key.slice(8)] || key.slice(8).replaceAll('_',' ');
    const parts=key.split('__');
    if(parts.length>1) {
      const statistic=statistics[parts.at(-1)] || parts.at(-1).replaceAll('_',' ');
      const raw=parts.at(-2),pro=raw.startsWith('PRO_') || parts.includes('pro');
      const index=raw.replace(/^PRO_/,'').toUpperCase();
      const sensor=pro ? ' (Pro)' : parts.includes('basico') ? ' (Básico)' : '';
      return `${index}${sensor} · ${statistic}`;
    }
    return key.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
  }
  function date(value) {
    if(!value) return 'Estático';
    const m=/^(\d{4})-(\d{2})-\d{2}$/.exec(value);
    return m ? `${months[Number(m[2])]} ${m[1]}` : value;
  }
  const hasNumber=value=>value!==null && value!==undefined && value!=='' && Number.isFinite(Number(value));
  function capabilities(data) {
    return {rendimiento:hasNumber(data.resultado?.prediccion)||hasNumber(data.resultado?.observado),
      errores:hasNumber(data.metricas?.error_firmado_t_ha),
      aportes:!!(data.contribuciones?.some(c=>hasNumber(c.aporte_t_ha)) || data.contexto_modelo?.shap_hgb_parcial?.some(c=>hasNumber(c.aporte_redondeado_t_ha))),
      modelo:!!(data.modelo?.validacion?.length || data.modelo?.importancias_globales?.length || Object.values(data.contexto_modelo?.variables_modelo || {}).some(hasNumber))};
  }
  function unit(key) {
    if(/^PREC_/.test(key)) return 'mm';
    if(/^(Tmax|Tmin)_/.test(key)) return '°C';
    if(key==='Elevacion_INEGI_CEM4_120m_mean') return 'm';
    if(key==='Pendiente_INEGI_CEM4_120m_grados_mean' || key==='latitud' || key==='longitud') return '°';
    if(key==='AREA_HA' || key==='area_ha') return 'ha';
    return '';
  }
  return {variable,date,unit,hasNumber,capabilities,scheme:key=>schemeNames[key] || key};
})();
