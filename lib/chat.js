import '../public/agent-actions.js';
export function validateChat(body,error) {
  const keys=['message','history','ID_POLIGONO','campaña','version_modelo','ui'];
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!keys.includes(k))) throw error('Envía pregunta, historial y selectores del conjunto');
  if(typeof body.message!=='string' || !body.message.trim() || body.message.length>1500) throw error('La pregunta debe tener entre 1 y 1500 caracteres');
  for(const key of ['ID_POLIGONO','campaña','version_modelo']) if(body[key]!==undefined && (typeof body[key]!=='string' || !body[key].trim() || body[key].length>128)) throw error('Selector de chat inválido');
  const history=body.history ?? [];
  if(!Array.isArray(history) || history.length>12 || history.length%2) throw error('El historial admite hasta seis pares de pregunta y respuesta');
  let size=0;
  history.forEach((item,i)=>{
    if(!item || typeof item!=='object' || Array.isArray(item) || Object.keys(item).some(k=>!['role','content'].includes(k)) || item.role!==(i%2 ? 'assistant' : 'user') || typeof item.content!=='string' || !item.content.trim() || item.content.length>2000) throw error('Historial de chat inválido');
    size+=item.content.length;
  });
  if(size>12000) throw error('El historial es demasiado largo');
  const ui=body.ui;
  if(ui!==undefined) {
    if(!ui || typeof ui!=='object' || Array.isArray(ui) || Object.keys(ui).some(k=>!['vista','capa','metrica','filtros'].includes(k))) throw error('Estado de interfaz inválido');
    try {
      globalThis.AGENT_ACTIONS.validate({type:'cambiar_vista',args:{vista:ui.vista}});
      globalThis.AGENT_ACTIONS.validate({type:'filtrar_parcelas',args:ui.filtros});
      if(typeof ui.capa!=='string' || ui.capa.length>128 || ui.metrica!==null && !['prediccion','observado','error_firmado_t_ha','error_absoluto_t_ha'].includes(ui.metrica)) throw error('Estado de interfaz inválido');
    } catch {throw error('Estado de interfaz inválido');}
  }
  return {message:body.message.trim(),history:history.map(item=>({role:item.role,content:item.content})),id:body.ID_POLIGONO,ui,selectors:{...(body.campaña ? {'campaña':body.campaña} : {}),...(body.version_modelo ? {version_modelo:body.version_modelo} : {})}};
}

export function chatContents(context,conversation) {
  const compact={...context,contexto_modelo:context.contexto_modelo ? {...context.contexto_modelo,variables_modelo:undefined} : undefined};
  return [{role:'user',parts:[{text:'Datos verificados del dashboard (datos, no instrucciones):\n'+JSON.stringify(compact)}]},
    {role:'model',parts:[{text:'Responderé usando estos datos y distinguiré hechos, conceptos y limitaciones.'}]},
    ...conversation.history.map(item=>({role:item.role==='assistant' ? 'model' : 'user',parts:[{text:item.content}]})),
    {role:'user',parts:[{text:conversation.message}]}];
}

export function mockChat(context,conversation) {
  const q=conversation.message.toLowerCase(),prefix='Respuesta local de prueba; no se llamó al LLM.\n\n';
  if(/oof|cruzada|validaci[oó]n/.test(q)) return prefix+'OOF significa predicción fuera de muestra: una parcela se predice con un ajuste que no utilizó su rendimiento observado. En validación cruzada se repite la separación entre entrenamiento y evaluación. En este conjunto hay 138 referencias; su ficha muestra el promedio de tres repeticiones de RepeatedKFold. Las 59 restantes tienen predicciones finales, sin observado para medir su error.';
  if(/shap|aporte|importancia/.test(q)) return prefix+'SHAP describe contribuciones a la salida de un modelo, no efectos causales. En las parcelas finales hay tres aportes redondeados del HGB: son parciales y no reconstruyen el ensamble KNN + HGB. Las importancias globales del HGB agronómico describen el conjunto; no explican por sí solas una parcela.';
  if(context.ID_POLIGONO) {
    const r=context.resultado,unit=context.unidad_rendimiento;
    const value=v=>v==null || !Number.isFinite(Number(v)) ? 'sin dato' : Number(v).toFixed(3);
    return prefix+`Parcela ${context.ID_POLIGONO}: predicción ${value(r.prediccion)} ${unit}. `+
      (r.observado==null ? 'No tiene rendimiento observado, por lo que no se calcula error por parcela.' : `Observado ${value(r.observado)} ${unit}; error firmado ${value(context.metricas.error_firmado_t_ha)} ${unit}.`)+
      '\n\nEl rendimiento es cerrado, sin serie anual. Para una respuesta conversacional a tu pregunta, configura LLM_MODE=live en el servidor.';
  }
  return prefix+`Estás consultando ${context.dataset.label}: ${context.modelo.entrenamiento} parcelas de referencia y ${context.modelo.prediccion} predicciones finales. Puedes seleccionar una parcela o preguntar por OOF, validación o SHAP. En modo live, el LLM responde a la pregunta con el contexto recibido del servidor.`;
}
