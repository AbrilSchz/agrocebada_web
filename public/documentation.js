(() => {
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const inline=value=>esc(value).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  // Markdown sencillo: todo el texto se escapa antes del formato. No se admite HTML ni scripts.
  function markdown(source) {
    const lines=source.split('\n'),html=[];
    for(let i=0;i<lines.length;i++) {
      const line=lines[i];
      if(/^```/.test(line)) {
        const block=[];
        while(++i<lines.length && !/^```/.test(lines[i])) block.push(lines[i]);
        html.push(`<pre><code>${esc(block.join('\n'))}</code></pre>`);
      } else if(/^\s*\|/.test(line) && /^\s*\|[\s:|\-]+\|\s*$/.test(lines[i+1] || '')) {
        const cells=text=>text.trim().replace(/^\||\|$/g,'').split('|').map(x=>inline(x.trim()));
        const head=cells(line);i++;
        const rows=[];
        while(i+1<lines.length && /^\s*\|/.test(lines[i+1])) rows.push(cells(lines[++i]));
        html.push(`<div class="table-wrap"><table><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      } else if(/^#{1,6}\s/.test(line)) {
        const level=Math.min(6,line.match(/^#+/)[0].length+2);
        html.push(`<h${level}>${inline(line.replace(/^#+\s*/,''))}</h${level}>`);
      } else if(/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        html.push(`<p class="notebook-bullet">${inline(line)}</p>`);
      } else if(/^>\s?/.test(line)) html.push(`<blockquote>${inline(line.replace(/^>\s?/,''))}</blockquote>`);
      else if(line.trim()) html.push(`<p>${inline(line)}</p>`);
    }
    return html.join('');
  }
  let catalogue=null,cataloguePromise=null,sequence=0,controller=null,activeTab='reto';
  async function get(url,options) {
    const response=await fetch(url,options),data=await response.json();
    if(!response.ok) throw new Error(data.error || 'No se pudo cargar la documentación');
    return data;
  }
  async function loadCatalogue() {
    const status=$('#doc-code-status');
    if(catalogue) return;
    status.hidden=false;status.textContent='Cargando libretas…';
    try {
      cataloguePromise ??= get('/api/documentacion').catch(error=>{cataloguePromise=null;throw error;});
      catalogue=await cataloguePromise;
      $('#notebook-list').innerHTML=catalogue.notebooks.map(n=>`<article class="notebook-card"><span class="eyebrow">LIBRETA DEL MODELO</span><h3>${esc(n.titulo)}</h3><p>${esc(n.descripcion)}</p><div><button type="button" class="secondary-button" data-notebook="${esc(n.id)}">Leer libreta →</button><a href="${esc(n.descarga)}" download>Descargar .ipynb</a></div></article>`).join('');
      $('#source-list').innerHTML='<ul>'+catalogue.fuentes.map(f=>`<li><a href="${esc(f.descarga)}" download>${esc(f.titulo)}</a><small>${esc(f.archivo)}</small></li>`).join('')+'</ul><a href="https://github.com/RoshTzsche/agrocebada_web" target="_blank" rel="noopener">Ver todo el código en GitHub ↗</a>';
      status.hidden=true;
    } catch(error) {status.textContent=error.message;status.hidden=false;}
  }
  async function openNotebook(id) {
    const item=catalogue?.notebooks.find(n=>n.id===id);
    if(!item) return;
    const own=++sequence;controller?.abort();controller=new AbortController();
    const viewer=$('#notebook-viewer');viewer.hidden=false;viewer.innerHTML='<p role="status">Cargando el contenido de la libreta…</p>';
    $('#notebook-list').querySelectorAll('[data-notebook]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.notebook===id)));
    try {
      const data=await get(item.url,{signal:controller.signal});
      if(sequence!==own) return;
      const total=data.celdas.filter(c=>c.tipo==='code').length;
      viewer.innerHTML=`<div class="notebook-heading"><div><span class="eyebrow">LECTURA · ${esc(data.lenguaje)}</span><h3>${esc(data.titulo)}</h3><p>${total} celdas de código · salidas guardadas, sin ejecutar</p></div><button type="button" class="secondary-button" data-close-notebook>Cerrar libreta</button></div>`+
        data.celdas.map(cell=>`<article class="notebook-cell ${cell.tipo==='code' ? 'code-cell' : 'markdown-cell'}">${cell.tipo==='code' ? `<span class="cell-label">Celda ${cell.numero} · In [${cell.ejecucion ?? ' '}]</span><pre><code>${esc(cell.fuente)}</code></pre>` : markdown(cell.fuente)}${cell.salidas.length ? `<details class="notebook-output"><summary>Ver ${cell.salidas.length} salida${cell.salidas.length===1 ? '' : 's'} guardada${cell.salidas.length===1 ? '' : 's'}</summary>${cell.salidas.map(output=>output.tipo==='imagen' ? `<img src="data:${output.mime};base64,${output.contenido}" alt="Salida gráfica guardada de la celda ${cell.numero}" loading="lazy">` : `<pre>${esc(output.contenido)}</pre>`).join('')}</details>` : ''}</article>`).join('');
      viewer.scrollIntoView({block:'start',behavior:'auto'});
    } catch(error) {
      if(sequence!==own || error.name==='AbortError') return;
      viewer.innerHTML=`<p class="error" role="alert">${esc(error.message)}</p><button type="button" class="secondary-button" data-retry-notebook="${esc(id)}">Reintentar</button>`;
    }
  }
  function tab(name,focus=false) {
    activeTab=name;
    document.querySelectorAll('.doc-tabs [role=tab]').forEach(button=>{
      const selected=button.id==='doc-tab-'+name;
      button.setAttribute('aria-selected',String(selected));button.tabIndex=selected ? 0 : -1;
      if(selected && focus) button.focus();
    });
    document.querySelectorAll('.doc-panel').forEach(panel=>panel.hidden=panel.id!=='doc-panel-'+name);
    if(name==='codigo') loadCatalogue();
  }
  const names=['reto','equipo','resultados','codigo'];
  names.forEach(name=>{
    const button=$('#doc-tab-'+name);
    button.onclick=()=>tab(name);
    button.onkeydown=e=>{
      const index=names.indexOf(name),next=e.key==='ArrowRight' ? (index+1)%4 : e.key==='ArrowLeft' ? (index+3)%4 : e.key==='Home' ? 0 : e.key==='End' ? 3 : null;
      if(next!==null) {e.preventDefault();tab(names[next],true);}
    };
  });
  $('#notebook-list').onclick=e=>{const id=e.target.closest('[data-notebook]')?.dataset.notebook;if(id) openNotebook(id);};
  $('#notebook-viewer').onclick=e=>{
    if(e.target.closest('[data-close-notebook]')) {++sequence;controller?.abort();$('#notebook-viewer').hidden=true;$('#notebook-list').querySelectorAll('[data-notebook]').forEach(b=>b.setAttribute('aria-pressed','false'));}
    const retry=e.target.closest('[data-retry-notebook]')?.dataset.retryNotebook;if(retry) openNotebook(retry);
  };
  window.DOCUMENTATION={open:()=>{if(activeTab==='codigo') loadCatalogue();},markdown};
})();
