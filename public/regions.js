(() => {
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const polygons=geometry=>geometry.type==='Polygon' ? [geometry.coordinates] : geometry.type==='MultiPolygon' ? geometry.coordinates : [];
  function inRing([x,y],ring) {
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const [xi,yi]=ring[i],[xj,yj]=ring[j];
      if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    }
    return inside;
  }
  const contains=(geometry,point)=>polygons(geometry).some(rings=>inRing(point,rings[0]) && !rings.slice(1).some(r=>inRing(point,r)));
  function enrichParcels(fc,borders,states) {
    const municipalities=borders.features.filter(f=>f.properties.nivel==='municipio');
    return {...fc,features:fc.features.map(feature=>{
      const p=feature.properties,candidates=municipalities.filter(f=>norm(f.properties.nombre)===norm(p.municipio));
      const boundary=candidates.find(f=>contains(f.geometry,[p.longitud_ref,p.latitud_ref])) || (candidates.length===1 ? candidates[0] : null);
      return {...feature,properties:{...p,estado:states[boundary?.properties.entidad]?.nombre || '',municipio_cvegeo:boundary?.properties.cvegeo || ''}};
    })};
  }
  // Un rectángulo con huecos: el fondo exterior se desenfoca, los municipios quedan nítidos.
  function maskPath(features,project,width,height) {
    return `M-8 -8H${width+8}V${height+8}H-8Z`+features.flatMap(f=>polygons(f.geometry).flatMap(p=>p.map(ring=>
      ring.map(([lon,lat],i)=>{const point=project([lat,lon]);return `${i?'L':'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;}).join('')+'Z'))).join('');
  }
  function zoom(map,bounds,config,kind='parcel') {
    if(!bounds?.isValid()) return;
    map.stop();
    const compact=map.getSize().x<500;
    const options={paddingTopLeft:[compact ? 24 : 48,82],paddingBottomRight:[24,compact ? 106 : 96],maxZoom:kind==='municipality' ? config.zoomMunicipio || 12 : config.zoomParcela || 17};
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) map.fitBounds(bounds,{...options,animate:false});
    else map.flyToBounds(bounds,{...options,duration:config.duracionZoom || 1.1,easeLinearity:.3});
  }
  class Controller {
    constructor(map,config,onMunicipality) {
      this.map=map;this.config=config;this.onMunicipality=onMunicipality;this.visible=false;this.selected='';this.layers=new Map();this.labels=new Map();this.frame=null;
      for(const [name,z] of [['stateContext',300],['regionalContext',330],['municipalities',350]]) map.createPane(name).style.zIndex=z;
      map.getPane('stateContext').style.pointerEvents=map.getPane('regionalContext').style.pointerEvents='none';
      const ns='http://www.w3.org/2000/svg';
      this.svg=document.createElementNS(ns,'svg');this.svg.setAttribute('class','map-mask-definitions');this.svg.setAttribute('aria-hidden','true');
      const defs=document.createElementNS(ns,'defs'),clip=document.createElementNS(ns,'clipPath');
      clip.id='map-context-clip';clip.setAttribute('clipPathUnits','userSpaceOnUse');
      this.path=document.createElementNS(ns,'path');this.path.setAttribute('clip-rule','evenodd');clip.append(this.path);defs.append(clip);this.svg.append(defs);map.getContainer().append(this.svg);
      this.blur=document.createElement('div');this.blur.className='map-context-blur';this.blur.hidden=true;this.blur.setAttribute('aria-hidden','true');map.getPane('regionalContext').append(this.blur);
      const schedule=()=>{if(this.frame!==null) return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.updateMask();});};
      map.on('move zoom resize',schedule);
      map.on('zoom zoomend',()=>this.updateLabels());
      map.on('zoomanim',()=>{this.blur.hidden=true;});map.on('zoomend',()=>{this.blur.hidden=!this.visible;this.updateMask();});
    }
    load(data,parcels) {
      const C=this.config,ids=new Set(C.municipiosSeleccionados);
      this.features=data.features.filter(f=>f.properties.nivel==='municipio' && ids.has(f.properties.cvegeo));
      if(this.features.length!==ids.size) throw new Error('Falta algún municipio seleccionado en los límites INEGI');
      this.parcels=parcels;
      this.states=L.geoJSON({type:'FeatureCollection',features:data.features.filter(f=>f.properties.nivel==='estado' && C.estados[f.properties.entidad])},{pane:'stateContext',interactive:false,style:f=>({color:C.estados[f.properties.entidad].color,weight:2,opacity:.7,fillOpacity:.07})});
      this.municipalities=L.geoJSON({type:'FeatureCollection',features:this.features},{pane:'municipalities',style:f=>this.style(f),onEachFeature:(feature,layer)=>{
        const p=feature.properties,count=parcels.filter(f=>f.properties.municipio_cvegeo===p.cvegeo).length;
        this.labels.set(p.cvegeo,`<strong>${esc(p.nombre)}</strong><span>${esc(C.estados[p.entidad].nombre)} · ${count} parcelas</span>`);
        layer.on({mouseover:()=>layer.setStyle(this.style(feature,true)),mouseout:()=>layer.setStyle(this.style(feature)),click:()=>this.choose(layer)});
        this.layers.set(p.cvegeo,layer);
      }});
    }
    style(feature,hover=false) {
      const selected=this.selected===feature.properties.nombre;
      return {color:this.config.estados[feature.properties.entidad].color,weight:hover || selected ? 2.8 : 1.3,opacity:.95,fillColor:this.config.estados[feature.properties.entidad].color,fillOpacity:hover ? .26 : selected ? .16 : .065,className:'municipality-button'};
    }
    choose(layer) {this.onMunicipality(layer.feature.properties,layer.getBounds());}
    setVisible(visible) {
      this.visible=visible;this.blur.hidden=!visible;
      this.updateLabels();
      if(!this.municipalities) return;
      for(const layer of [this.states,this.municipalities]) {if(visible) layer.addTo(this.map);else this.map.removeLayer(layer);}
      if(visible) {
        this.updateMask();
        this.layers.forEach(layer=>{
          const path=layer.getElement();if(!path || path.dataset.keyboardReady) return;
          path.dataset.keyboardReady='1';path.setAttribute('tabindex','0');path.setAttribute('role','button');path.setAttribute('aria-label',`Acercar al municipio ${layer.feature.properties.nombre}`);
          path.addEventListener('focus',()=>{layer.setStyle(this.style(layer.feature,true));if(this.labelsAllowed()) layer.openTooltip();});
          path.addEventListener('blur',()=>{layer.setStyle(this.style(layer.feature));layer.closeTooltip();});
          path.addEventListener('keydown',e=>{if(e.key==='Enter' || e.key===' ') {e.preventDefault();this.choose(layer);}});
        });
      }
    }
    labelsAllowed() {return this.visible && this.map.getZoom()<(this.config.zoomEtiquetasMax ?? 14);}
    updateLabels() {
      const allowed=this.labelsAllowed();
      this.layers.forEach((layer,key)=>{
        if(allowed && !layer.getTooltip()) layer.bindTooltip(this.labels.get(key),{sticky:true,direction:'top',className:'municipality-tooltip'});
        else if(!allowed && layer.getTooltip()) {layer.closeTooltip();layer.unbindTooltip();}
      });
    }
    updateMask() {
      if(!this.visible || !this.features) return;
      const size=this.map.getSize();if(!size.x || !size.y) return;
      L.DomUtil.setPosition(this.blur,this.map.containerPointToLayerPoint([0,0]));
      this.blur.style.width=size.x+'px';this.blur.style.height=size.y+'px';
      this.path.setAttribute('d',maskPath(this.features,p=>this.map.latLngToContainerPoint(p),size.x,size.y));
    }
    select(name) {this.selected=name;this.municipalities?.setStyle(f=>this.style(f));}
    home() {if(this.municipalities) zoom(this.map,this.municipalities.getBounds(),this.config,'municipality');}
    focus(name) {const layer=[...this.layers.values()].find(l=>l.feature.properties.nombre===name);if(layer) zoom(this.map,layer.getBounds(),this.config,'municipality');}
  }
  window.REGIONS={polygons,contains,enrichParcels,maskPath,zoom,Controller};
})();
