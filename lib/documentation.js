import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';

const sourceText = value => Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : '';
// HTML, JavaScript y SVG de las salidas del notebook no se envían al visor.
// Solo texto y PNG/JPEG; leer un notebook nunca ejecuta sus celdas.
export function notebookView(notebook) {
  return {
    lenguaje: notebook.metadata?.language_info?.name || 'python',
    celdas: (notebook.cells || []).map((cell, index) => ({
      numero:index + 1, tipo:cell.cell_type === 'code' ? 'code' : 'markdown', fuente:sourceText(cell.source),
      ejecucion:Number.isInteger(cell.execution_count) ? cell.execution_count : null,
      salidas:(cell.outputs || []).flatMap(output => {
        const results=[];
        const text=sourceText(output.text || output.data?.['text/plain']);
        if(text) results.push({tipo:'texto',contenido:text});
        if(output.output_type==='error') results.push({tipo:'texto',contenido:`${sourceText(output.ename)}: ${sourceText(output.evalue)}`});
        for(const mime of ['image/png','image/jpeg']) {
          const data=sourceText(output.data?.[mime]).replace(/\s/g,'');
          if(data && /^[A-Za-z0-9+/]+={0,2}$/.test(data)) results.push({tipo:'imagen',mime,contenido:data});
        }
        return results;
      })
    }))
  };
}

export function registerDocumentation(app, root) {
  const manifest=JSON.parse(readFileSync(path.join(root,'modelos','documentacion.json'),'utf8'));
  const notebookRoot=path.join(root,'modelos','libretas_finales');
  const notebooks=manifest.notebooks.map(item=>({...item,path:path.join(notebookRoot,item.archivo)}));
  const sources=manifest.fuentes.map(item=>({...item,path:path.resolve(root,item.archivo)}));
  // La lista está versionada. El cliente solo envía IDs, nunca rutas de archivos.
  for(const item of [...notebooks,...sources]) {
    if(!/^[a-z0-9-]+$/.test(item.id) || !item.path.startsWith(root+path.sep)) throw new Error('Entrada de documentación inválida');
  }
  const availableNotebooks=notebooks.filter(item=>existsSync(item.path));
  const availableSources=sources.filter(item=>existsSync(item.path));
  const cache=new Map();
  app.get('/api/documentacion', (_req,res)=>res.json({
    notebooks:availableNotebooks.map(({path:_path,...item})=>({...item,url:`/api/documentacion/notebooks/${item.id}`,descarga:`/documentacion/archivos/${item.id}`})),
    fuentes:availableSources.map(({path:_path,...item})=>({...item,descarga:`/documentacion/archivos/${item.id}`}))
  }));
  app.get('/api/documentacion/notebooks/:id',(req,res)=>{
    const item=availableNotebooks.find(item=>item.id===req.params.id);
    if(!item) return res.status(404).json({error:'Libreta no encontrada'});
    try {
      if(!cache.has(item.id)) cache.set(item.id,notebookView(JSON.parse(readFileSync(item.path,'utf8'))));
      res.json({id:item.id,titulo:item.titulo,...cache.get(item.id)});
    } catch {res.status(500).json({error:'No se pudo leer la libreta'});}
  });
  const downloads=[...availableNotebooks,...availableSources,{id:'reporte',archivo:'Reporte_Metodologico_AgroCebada_Final.docx',path:path.join(notebookRoot,'Reporte_Metodologico_AgroCebada_Final.docx')}];
  app.get('/documentacion/archivos/:id',(req,res)=>{
    const item=downloads.find(item=>item.id===req.params.id);
    if(!item) return res.status(404).json({error:'Archivo no encontrado'});
    res.set('X-Content-Type-Options','nosniff');
    res.download(item.path,path.basename(item.archivo));
  });
}
