export function validateAudio(body) {
  const error=message=>Object.assign(new Error(message),{status:400});
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['mimeType','audio'].includes(k)) || !['audio/webm','audio/ogg','audio/mp4','audio/wav'].includes(body.mimeType)) throw error('Formato de audio no admitido');
  if(typeof body.audio!=='string' || body.audio.length>1400000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.audio)) throw error('Audio inválido o demasiado grande');
  const bytes=Buffer.from(body.audio,'base64');
  if(bytes.length<100 || bytes.length>1024*1024 || bytes.toString('base64')!==body.audio) throw error('Audio inválido o demasiado grande');
  return {mimeType:body.mimeType==='audio/mp4' ? 'audio/m4a' : body.mimeType,data:body.audio};
}
export async function generateGemini(body,{env=process.env,transport=fetch}={}) {
  const error=(message,status)=>Object.assign(new Error(message),{status});
  if(!env.GEMINI_API_KEY) throw error('La IA requiere GEMINI_API_KEY en el servidor',503);
  const model=env.GEMINI_MODEL || 'gemini-3.8-flash';
  if(!/^[a-zA-Z0-9._-]+$/.test(model)) throw error('GEMINI_MODEL inválido',503);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await transport(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},signal:controller.signal,body:JSON.stringify(body)});
    if([401,403].includes(response.status)) throw error('Revisa GEMINI_API_KEY y los permisos del proyecto en Google AI Studio',503);
    if(response.status===404) throw error('GEMINI_MODEL no está disponible para esta clave; revisa el modelo en Google AI Studio',503);
    if(response.status===429) throw error('Cuota de Google agotada. Intenta más tarde',429);
    if(!response.ok) throw error(`Google no pudo responder (HTTP ${response.status})`,502);
    const data=await response.json(),content=data.candidates?.[0]?.content;
    if(!Array.isArray(content?.parts)) throw error('Google no devolvió una respuesta',502);
    return {content,text:content.parts.filter(p=>typeof p.text==='string' && !p.thought).map(p=>p.text).join('\n').trim(),calls:content.parts.filter(p=>p.functionCall).map(p=>p.functionCall)};
  } catch(e) {
    if(e.name==='AbortError') throw error('Tiempo de espera agotado al llamar a Google',504);
    if(e.status) throw e;
    throw error('No se pudo conectar con Google',502);
  } finally {clearTimeout(timer);}
}
