(() => {
  const $=s=>document.querySelector(s);
  let context={parcelId:null,campaign:'agrocebada-final',model:'ensamble-50-50-v1'},messages=[],controller=null,sequence=0,busy=false,onOpen=null,applying=false,voiceState='idle';
  function error(message) {$('#chat-error').textContent=message;$('#chat-error').hidden=false;}
  function render() {
    const log=$('#chat-messages');log.replaceChildren();
    if(!messages.length) {const p=document.createElement('p');p.className='chat-welcome';p.textContent='Pregunta por tus datos o pide una acción: «selecciona la parcela AGC_003», «muestra la elevación» o «abre la tabla de parcelas».';log.append(p);}
    for(const item of messages) {
      const article=document.createElement('article');article.className='chat-message chat-'+item.role;
      const author=document.createElement('span');author.className='chat-author';author.textContent=item.role==='user' ? 'Tú' : 'AgroCebada';
      const text=document.createElement('p');text.textContent=item.content;article.append(author,text);
      if(item.actions?.length) {const list=document.createElement('p');list.className='chat-applied';list.textContent='Acciones enviadas: '+item.actions.join(' · ');article.append(list);}
      log.append(article);
    }
    log.scrollTop=log.scrollHeight;
  }
  function setBusy(value) {
    busy=value;$('#chat-send').disabled=value || voiceState!=='idle';$('#chat-input').disabled=value;
    $('#chat-mic').disabled=value || ['permission','transcribing'].includes(voiceState);
    document.querySelectorAll('[data-chat-question]').forEach(b=>b.disabled=value || voiceState!=='idle');
    $('#chat-form').setAttribute('aria-busy',String(value));$('#chat-status').hidden=!value && voiceState==='idle';
    $('#chat-status').textContent=value ? 'Consultando y preparando la selección…' : {permission:'Preparando micrófono…',recording:'Escuchando… pulsa detener al terminar (máximo 20 s).',transcribing:'Transcribiendo tu comando…'}[voiceState] || '';
  }
  const voice=window.createChatVoice({onState:state=>{
    voiceState=state;$('#chat-mic').setAttribute('aria-pressed',String(state==='recording'));
    $('#chat-mic').setAttribute('aria-label',state==='recording' ? 'Detener y enviar comando por voz' : 'Dar un comando por voz');
    $('#chat-mic').textContent=state==='recording' ? '■' : '🎙';setBusy(busy);
  },onError:error,onTranscript:message=>{$('#chat-input').value=message;submit();}});
  function reset() {++sequence;controller?.abort();controller=null;voice.cancel();messages=[];$('#chat-input').value='';setBusy(false);$('#chat-error').hidden=true;$('#chat-mode').textContent='Consulta y controla la web';render();}
  function setContext(value) {
    const next={parcelId:value.parcelId || null,campaign:value.campaign || 'agrocebada-final',model:value.model || 'ensamble-50-50-v1'};
    if(JSON.stringify(context)!==JSON.stringify(next)) {context=next;if(!applying) reset();}
    $('#chat-context').textContent=(context.parcelId ? 'Parcela '+context.parcelId : 'Conjunto completo')+' · '+context.model;
  }
  function position() {
    const panel=$('#chat-panel'),rect=$('#chat-toggle').getBoundingClientRect();
    const onMap=!$('#container').hidden,small=window.innerWidth<=700;
    const bottom=onMap && !small ? Math.max(20,window.innerHeight-rect.top+10) : 20;
    panel.style.bottom=bottom+'px';panel.style.maxHeight=Math.max(190,Math.min(520,window.innerHeight-bottom-76))+'px';
  }
  function toggle(open,focus=true) {
    $('#chat-panel').hidden=!open;$('#chat-toggle').setAttribute('aria-expanded',String(open));$('#chat-reopen').setAttribute('aria-expanded',String(open));
    if(open) {onOpen?.();position();$('#chat-input').focus();}else {voice.cancel();if(focus) ($('#container').hidden ? $('#chat-reopen') : $('#chat-toggle')).focus();}
  }
  function history() {
    const rows=messages.slice(-12).map(item=>({role:item.role,content:item.content.slice(0,2000)}));
    while(rows.reduce((sum,item)=>sum+item.content.length,0)>12000) rows.splice(0,2);
    return rows;
  }
  function modeLabel(mode) {$('#chat-mode').textContent=mode==='mock' ? 'Respuesta local · sin llamada a IA' : mode==='local' ? 'Atajo local · sin llamada a IA' : 'IA · resultados almacenados';}
  async function submit() {
    const message=$('#chat-input').value.trim();if(busy || !message || message.length>1500) return;
    voice.cancel();
    const payload={message,history:history(),'campaña':context.campaign,version_modelo:context.model,...(context.parcelId ? {ID_POLIGONO:context.parcelId} : {}),...(window.DASHBOARD_AGENT ? {ui:window.DASHBOARD_AGENT.snapshot()} : {})};
    const scope=JSON.stringify(context),own=++sequence,previous=messages.length;controller=new AbortController();
    messages.push({role:'user',content:message});render();$('#chat-input').value='';$('#chat-error').hidden=true;setBusy(true);
    try {
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      const data=await response.json();
      if(own!==sequence) return;
      if(!response.ok) throw new Error(response.status===503 ? 'La IA no está disponible en este momento. Los botones de navegación siguen funcionando.' : data.error || 'No se pudo obtener la respuesta');
      if(typeof data.reply!=='string' || !data.reply.trim()) throw new Error('El chat no devolvió una respuesta');
      let applied=[];
      applying=true;
      try {if(data.actions?.length) applied=window.DASHBOARD_AGENT.apply(data.actions);} finally {applying=false;}
      if(JSON.stringify(context)!==scope) messages=[{role:'user',content:message}];
      messages.push({role:'assistant',content:data.reply,actions:applied});modeLabel(data.mode);render();
    } catch(e) {
      if(own!==sequence || e.name==='AbortError') return;
      messages.splice(previous);$('#chat-input').value=message;render();error(e.message);
    } finally {if(own===sequence) {controller=null;setBusy(false);if(!$('#chat-panel').hidden) $('#chat-input').focus();}}
  }
  $('#chat-toggle').onclick=()=>toggle($('#chat-panel').hidden);
  $('#chat-reopen').onclick=()=>toggle($('#chat-panel').hidden);
  $('#chat-close').onclick=()=>toggle(false);
  $('#chat-reset').onclick=()=>{reset();$('#chat-input').focus();};
  $('#chat-mic').onclick=()=>{$('#chat-error').hidden=true;voice.start();};
  $('#chat-form').onsubmit=e=>{e.preventDefault();return submit();};
  $('#chat-input').onkeydown=e=>{if(e.key==='Enter' && !e.shiftKey && !e.isComposing) {e.preventDefault();submit();}};
  document.querySelectorAll('[data-chat-question]').forEach(button=>button.onclick=()=>{if(busy) return;$('#chat-input').value=button.dataset.chatQuestion;return submit();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && !$('#chat-panel').hidden) {e.preventDefault();e.stopImmediatePropagation();toggle(false);}},true);
  window.addEventListener('resize',position);
  // El chat permanece abierto al pasar del mapa a la tabla o la documentación.
  document.body.append($('#chat-panel'));
  window.CHAT={setContext,close:()=>toggle(false,false),onOpen:callback=>{onOpen=callback;},
    viewChanged:view=>{$('#chat-reopen').hidden=view==='mapa';if(!$('#chat-panel').hidden) position();},
    openExplanation:(text,mode)=>{if(typeof text!=='string' || !text.trim()) return;reset();messages=[{role:'user',content:'Interpreta esta parcela en un párrafo breve, sin repetir las tarjetas.'},{role:'assistant',content:text}];modeLabel(mode);render();toggle(true);}
  };
  setContext(context);render();
})();
