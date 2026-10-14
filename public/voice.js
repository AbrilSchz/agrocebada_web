(() => {
  const mimes=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4','audio/webm','audio/ogg'];
  window.createChatVoice=function({onState,onTranscript,onError}) {
    let epoch=0,stream=null,recorder=null,timer=null,controller=null,active=false;
    const supported=()=>Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder && mimes.some(m=>MediaRecorder.isTypeSupported(m)));
    function stopTracks() {stream?.getTracks().forEach(t=>t.stop());stream=null;clearTimeout(timer);timer=null;}
    function cancel() {epoch++;active=false;controller?.abort();controller=null;if(recorder?.state==='recording') recorder.stop();recorder=null;stopTracks();onState('idle');}
    async function start() {
      if(active) {if(recorder?.state==='recording') recorder.stop();return;}
      if(!supported()) {onError('Tu navegador necesita micrófono disponible y una conexión HTTPS o localhost. Puedes escribir el comando.');return;}
      const own=++epoch;active=true;onState('permission');controller=new AbortController();
      try {
        const config=await fetch('/api/chat/config',{signal:controller.signal});
        if(!config.ok || !(await config.json()).voice) throw new Error('La voz estará disponible cuando se active la IA del servidor. Puedes escribir o usar los botones rápidos.');
        if(own!==epoch) return;
        const source=await navigator.mediaDevices.getUserMedia({audio:true});
        if(own!==epoch) {source.getTracks().forEach(t=>t.stop());return;}
        stream=source;
        const mimeType=mimes.find(m=>MediaRecorder.isTypeSupported(m)),chunks=[];
        recorder=new MediaRecorder(stream,{mimeType,audioBitsPerSecond:64000});
        let bytes=0;
        recorder.ondataavailable=e=>{if(e.data.size) {chunks.push(e.data);bytes+=e.data.size;if(bytes>1024*1024) {cancel();onError('La grabación fue demasiado grande. Intenta una frase más corta.');}}};
        recorder.onerror=()=>{if(own===epoch) {cancel();onError('No se pudo grabar el audio. Intenta de nuevo.');}};
        recorder.onstop=async()=>{
          if(own!==epoch) return;stopTracks();
          active=false;onState('transcribing');
          try {
            const blob=new Blob(chunks,{type:mimeType});
            if(blob.size<100 || blob.size>1024*1024) throw new Error('No se grabó una frase válida. Intenta de nuevo.');
            const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('No se pudo leer el audio'));reader.readAsDataURL(blob);});
            const response=await fetch('/api/chat/voz',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mimeType:mimeType.split(';')[0],audio:data}),signal:controller.signal});
            const result=await response.json();if(own!==epoch) return;
            if(!response.ok) throw new Error(result.error || 'No se pudo transcribir el comando');
            if(typeof result.transcript!=='string' || !result.transcript.trim() || result.transcript.length>1500) throw new Error('No se reconoció una frase. Intenta de nuevo.');
            recorder=null;controller=null;onState('idle');onTranscript(result.transcript);
          } catch(e) {if(own===epoch && e.name!=='AbortError') {cancel();onError(e.message);}}
        };
        recorder.start(1000);onState('recording');timer=setTimeout(()=>{if(own===epoch && recorder?.state==='recording') recorder.stop();},20000);
      } catch(e) {if(own===epoch && e.name!=='AbortError') {cancel();onError(e.name==='NotAllowedError' ? 'El micrófono no tiene permiso. Actívalo en tu navegador o escribe el comando.' : e.message);}}
    }
    return {start,cancel,supported};
  };
})();
