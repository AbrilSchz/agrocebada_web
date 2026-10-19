(() => {
  window.createDashboardAgent=function(api) {
    function validate(action) {
      const checked=window.AGENT_ACTIONS.validate(action),a=checked.args;
      if(checked.type==='seleccionar_parcela' && !api.parcels().some(f=>String(f.id)===a.id)) throw new Error('La parcela no está cargada en el mapa');
      if(checked.type==='mostrar_capa' && !api.layers().some(c=>c.id===a.id)) throw new Error('La capa no está disponible');
      if(checked.type==='filtrar_parcelas') {
        if(a.estado && !api.parcels().some(f=>f.properties.estado===a.estado)) throw new Error('Estado no disponible');
        if(a.municipio && !api.parcels().some(f=>f.properties.municipio===a.municipio && (!a.estado || f.properties.estado===a.estado))) throw new Error('Municipio no disponible');
      }
      return checked;
    }
    const labels={seleccionar_parcela:a=>'Parcela '+a.id,mostrar_capa:a=>'Capa '+api.layers().find(c=>c.id===a.id).nombre,mostrar_resultados:a=>({prediccion:'Predicción',observado:'Observado',error_firmado_t_ha:'Error firmado',error_absoluto_t_ha:'Error absoluto'}[a.metrica]),cambiar_vista:a=>'Vista '+a.vista,filtrar_parcelas:()=> 'Filtros de parcelas actualizados',limpiar_filtros:()=> 'Filtros limpiados',vista_general:()=> 'Vista regional',limites_geograficos:a=>a.visible ? 'Límites visibles' : 'Límites ocultos'};
    return {
      snapshot:()=>api.snapshot(),
      apply(actions) {
        if(!Array.isArray(actions) || actions.length>4) throw new Error('La respuesta contiene demasiadas acciones');
        const checked=actions.map(validate);
        let cohort=api.snapshot().filtros.conjunto;
        for(const action of checked) {
          if(action.type==='filtrar_parcelas' && action.args.conjunto!==undefined) cohort=action.args.conjunto;
          if(['limpiar_filtros','seleccionar_parcela'].includes(action.type)) cohort='';
          if(action.type==='mostrar_resultados' && cohort==='prediccion' && action.args.metrica!=='prediccion') throw new Error('Las parcelas finales no tienen observado ni errores. Selecciona entrenamiento o todas las parcelas.');
        }
        return checked.map(action=>{api[action.type](action.args);return labels[action.type](action.args);});
      }
    };
  };
})();
