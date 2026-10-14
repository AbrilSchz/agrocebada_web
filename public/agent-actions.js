// Contrato compartido: el LLM propone acciones; la aplicación valida sus argumentos.
(() => {
  const specs={
    seleccionar_parcela:{id:'string'}, mostrar_capa:{id:'string',fecha:'optionalString'},
    mostrar_resultados:{metrica:'metric'}, cambiar_vista:{vista:'view'},
    filtrar_parcelas:{conjunto:'optionalCohort',estado:'optionalString',municipio:'optionalString',busqueda:'optionalString',disponibilidad:'optionalAvailability',minimo:'optionalNumber',maximo:'optionalNumber'},
    limpiar_filtros:{}, vista_general:{}, limites_geograficos:{visible:'boolean'}
  };
  const metrics=['prediccion','observado','error_firmado_t_ha','error_absoluto_t_ha'];
  function validate(action) {
    if(!action || typeof action!=='object' || Array.isArray(action) || Object.keys(action).some(k=>!['type','args'].includes(k)) || !Object.hasOwn(specs,action.type)) throw new Error('Acción del dashboard no permitida');
    const args=action.args ?? {},spec=specs[action.type];
    if(!args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).some(k=>!Object.hasOwn(spec,k))) throw new Error('Argumentos de acción inválidos');
    for(const [key,type] of Object.entries(spec)) {
      const v=args[key],optional=type.startsWith('optional');
      if(v===undefined && optional) continue;
      const ok=type==='string' ? typeof v==='string' && v.trim() && v.length<=128 :
        type==='optionalString' ? typeof v==='string' && v.length<=128 :
        type==='optionalNumber' ? v===null || typeof v==='number' && Number.isFinite(v) :
        type==='boolean' ? typeof v==='boolean' :
        type==='metric' ? metrics.includes(v) :
        type==='view' ? ['mapa','tabla','documentacion'].includes(v) :
        type==='optionalCohort' ? ['','referencia','prediccion'].includes(v) :
        type==='optionalAvailability' ? ['','present','missing'].includes(v) : false;
      if(!ok) throw new Error('Argumento inválido: '+key);
    }
    if(args.minimo!=null && args.maximo!=null && args.minimo>args.maximo) throw new Error('El mínimo supera al máximo');
    return {type:action.type,args:{...args}};
  }
  const descriptions={seleccionar_parcela:'Selecciona una parcela por ID y acerca el mapa. Quita filtros que la oculten.',mostrar_capa:'Muestra una capa temática y opcionalmente una fecha disponible del insumo.',mostrar_resultados:'Colorea parcelas por una métrica almacenada. Los errores y observado solo tienen datos en referencias; no cambia el conjunto filtrado.',cambiar_vista:'Abre mapa, tabla de parcelas o documentación.',filtrar_parcelas:'Modifica solo los filtros indicados; vacío borra un filtro y null quita un límite numérico. Conjunto prediccion corresponde al botón Parcelas de validación. Los límites se aplican al valor de la capa o resultado actual.',limpiar_filtros:'Quita todos los filtros compartidos entre mapa y tabla.',vista_general:'Vuelve a la vista regional y limpia selección y filtros geográficos.',limites_geograficos:'Muestra u oculta estados y municipios.'};
  const enums={metric:metrics,view:['mapa','tabla','documentacion'],optionalCohort:['','referencia','prediccion'],optionalAvailability:['','present','missing']};
  const functions=Object.entries(specs).map(([name,spec])=>({name,description:descriptions[name],parameters:{type:'OBJECT',properties:Object.fromEntries(Object.entries(spec).map(([key,type])=>[key,{type:type==='boolean' ? 'BOOLEAN' : type==='optionalNumber' ? 'NUMBER' : 'STRING',...(type==='optionalNumber' ? {nullable:true} : {}),...(enums[type] ? {enum:enums[type]} : {})}])),...(Object.keys(spec).length ? {required:Object.keys(spec).filter(k=>!spec[k].startsWith('optional'))} : {})}}));
  globalThis.AGENT_ACTIONS={validate,functions};
})();
