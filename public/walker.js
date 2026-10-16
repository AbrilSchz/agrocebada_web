window.WALKER_CONFIG = Object.freeze({
  speed: 64,
  pauseTime: 4000,
  margin: 12,
  size: 116,
  fps: 20,
  frameCount: 20,
  bottom: 0,
  walkSheet: 'assets/walker/camina-sheet-20fps.png',
  idleImage: 'assets/walker/quieto.png',
});

(() => {
  'use strict';

  const CONFIG = window.WALKER_CONFIG;

  const root = document.querySelector('#walker-root');
  const character = root?.querySelector('.walker-character');
  const sprite = character?.querySelector('.walker-sprite');
  const chatPanel = document.querySelector('#chat-panel');
  const container = document.querySelector('#container');
  const mapArea = document.querySelector('#mapa');
  const plantAssistant = document.querySelector('#plant-assistant');
  if (!root || !character || !sprite) {
    console.error('No se encontró el contenedor o la imagen necesarios para iniciar el caminante.');
    return;
  }
  if (!Number.isFinite(CONFIG.fps) || CONFIG.fps <= 0 || !Number.isInteger(CONFIG.frameCount) || CONFIG.frameCount < 2) {
    console.error('La configuración de cuadros o FPS del caminante no es válida.');
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    x: CONFIG.margin,
    direction: 1,
    phase: 'walking',
    lastTime: null,
    pauseUntil: 0,
    pauseRemaining: 0,
    frameIndex: 0,
    frameElapsed: 0,
  };
  let width = 0;
  let minX = 0;
  let maxX = 0;
  let mode = 'patrol';
  let routeBlocked = false;
  let chatOpen = Boolean(chatPanel && !chatPanel.hidden);
  let animationFrame = 0;
  let paused = false;
  let assetsReady = false;
  const frameInterval = 1000 / CONFIG.fps;
  const frameWidthRatio = 172 / 238;

  function preloadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`No se pudo cargar ${source}`));
      image.src = source;
    });
  }

  function showFrame(index) {
    state.frameIndex = index;
    const offset = (index / CONFIG.frameCount) * 100;
    sprite.style.transform = `translate3d(-${offset}%, 0, 0)`;
  }

  function applyPose(phase) {
    if (phase === 'walking') {
      sprite.src = CONFIG.walkSheet;
      showFrame(0);
    } else {
      sprite.src = CONFIG.idleImage;
      sprite.style.transform = 'translate3d(0, 0, 0)';
      state.frameIndex = 0;
      state.frameElapsed = 0;
    }
  }

  function updateBounds() {
    const viewportWidth = window.innerWidth;
    const mapIsActive = Boolean(container && !container.hidden && mapArea);
    const area = mapIsActive
      ? mapArea.getBoundingClientRect()
      : {left: 0, right: viewportWidth};
    const mapIsVisible = mapIsActive && area.bottom > 0 && area.top < window.innerHeight;
    const bottom = CONFIG.bottom + (mapIsVisible ? Math.max(0, window.innerHeight - area.bottom) : 0);
    const leftEdge = Math.max(0, area.left);
    const rightEdge = Math.min(viewportWidth, area.right);
    const scale = viewportWidth <= 360 ? 0.58 : viewportWidth <= 700 ? 0.72 : 1;
    const height = CONFIG.size * scale;
    const preferredWidth = height * frameWidthRatio;
    width = Math.min(preferredWidth, Math.max(42, rightEdge - leftEdge - CONFIG.margin * 2));
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    root.style.bottom = `${bottom}px`;
    minX = leftEdge + Math.min(CONFIG.margin, (rightEdge - leftEdge - width) / 2);
    maxX = Math.max(minX, rightEdge - width - CONFIG.margin);
    if (mapIsActive) {
      const walkerTop = window.innerHeight - bottom - height;
      const walkerBottom = window.innerHeight - bottom;
      const overlapsVertically = element => {
        if (!element || element.hidden) return false;
        const rect = element.getBoundingClientRect();
        return walkerTop < rect.bottom && walkerBottom > rect.top;
      };
      const legend = document.querySelector('#map-legend');
      const assistant = document.querySelector('#plant-assistant');
      const summary = document.querySelector('#map-summary');
      const layers = document.querySelector('#layers-panel');
      if (overlapsVertically(legend)) {
        const rect = legend.getBoundingClientRect();
        if (rect.left <= leftEdge + CONFIG.margin * 2) minX = Math.max(minX, rect.right + 8);
      }
      if (assistant?.parentElement === mapArea && overlapsVertically(assistant)) {
        maxX = Math.min(maxX, assistant.getBoundingClientRect().left - width - 8);
      }
      for (const panel of [summary, layers]) {
        if (overlapsVertically(panel)) {
          const rect = panel.getBoundingClientRect();
          if (rect.right >= rightEdge - CONFIG.margin) {
            maxX = Math.min(maxX, rect.left - width - 8);
          }
        }
      }
      const wasBlocked = routeBlocked;
      routeBlocked = maxX < minX || !mapIsVisible;
      if (routeBlocked) {
        root.style.visibility = 'hidden';
        maxX = minX;
      } else {
        root.style.visibility = '';
      }
      if (routeBlocked !== wasBlocked) startOrPause();
    } else {
      const wasBlocked = routeBlocked;
      routeBlocked = false;
      root.style.visibility = '';
      if (routeBlocked !== wasBlocked) startOrPause();
    }
    state.x = Math.min(maxX, Math.max(minX, state.x));
    drawPosition();
  }

  function setState(phase, facing = state.direction > 0 ? 'right' : 'left') {
    if (root.dataset.facing !== facing) root.dataset.facing = facing;
    if (root.dataset.state !== phase) root.dataset.state = phase;
    if (state.phase !== phase) applyPose(phase);
    state.phase = phase;
    root.classList.toggle('walker--walking', phase === 'walking');
    root.classList.toggle('walker--idle', phase !== 'walking');
  }

  function drawPosition() {
    const offset = state.direction > 0 ? state.x + width : state.x;
    root.style.transform = `translate3d(${offset}px, 0, 0) scaleX(${-state.direction})`;
    if (mode === 'patrol' && plantAssistant) {
      const edge = window.innerWidth <= 700 ? 10 : 16;
      plantAssistant.style.transform = `translate3d(${state.x - edge}px, 0, 0)`;
    }
  }

  function placeForView() {
    const mapIsActive = Boolean(container && !container.hidden && mapArea);
    const nextMode = mapIsActive && plantAssistant?.dataset.position === 'welcome'
      ? 'welcome'
      : mapIsActive && plantAssistant?.dataset.position === 'map'
        ? 'selected'
        : 'patrol';
    const target = nextMode === 'patrol' ? document.body : plantAssistant;
    if (!target) return;
    if (mode !== nextMode) {
      mode = nextMode;
      root.dataset.mode = mode;
      state.lastTime = null;
      state.pauseUntil = 0;
      state.pauseRemaining = 0;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    if (root.parentElement !== target) target.append(root);
    if (mode === 'patrol') {
      root.style.transform = '';
      updateBounds();
      updatePausedState();
    } else {
      routeBlocked = false;
      root.style.visibility = '';
      if (plantAssistant) plantAssistant.style.transform = '';
      root.style.width = '';
      root.style.height = '';
      root.style.bottom = '';
      root.style.left = '';
      root.style.transform = 'none';
      setState('pausing');
      updatePausedState();
    }
  }

  function updatePausedState() {
    const shouldPause = !assetsReady || chatOpen || reducedMotion.matches || document.hidden || routeBlocked;
    const wasPaused = paused;
    paused = shouldPause;
    root.dataset.paused = String(shouldPause);
    root.dataset.reducedMotion = String(reducedMotion.matches);
    if (paused) {
      if (!wasPaused && state.pauseUntil) {
        state.pauseRemaining = Math.max(0, state.pauseUntil - performance.now());
      }
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      state.lastTime = null;
      setState('pausing');
      return;
    }

    if (mode !== 'patrol') {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      state.lastTime = null;
      setState('pausing');
      return;
    }

    if (wasPaused) {
      if (state.pauseRemaining) {
        state.pauseUntil = performance.now() + state.pauseRemaining;
        state.pauseRemaining = 0;
      }
      state.lastTime = null;
    }
    setState(state.pauseUntil ? 'pausing' : 'walking');
    if (!animationFrame) {
      animationFrame = requestAnimationFrame(animate);
    }
  }

  function animate(time) {
    if (paused) {
      animationFrame = 0;
      return;
    }

    state.x = Math.min(maxX, Math.max(minX, state.x));

    if (state.pauseUntil > time) {
      setState('pausing');
    } else {
      if (state.pauseUntil) {
        state.direction *= -1;
        state.pauseUntil = 0;
        setState('walking');
      }

      const elapsed = state.lastTime === null ? 0 : Math.min((time - state.lastTime) / 1000, 0.1);
      state.x += state.direction * CONFIG.speed * elapsed;
      state.frameElapsed += elapsed * 1000;
      if (state.frameElapsed >= frameInterval) {
        const advanced = Math.floor(state.frameElapsed / frameInterval);
        state.frameElapsed %= frameInterval;
        showFrame((state.frameIndex + advanced) % CONFIG.frameCount);
      }
      if (state.direction > 0 && state.x >= maxX) {
        state.x = maxX;
        state.pauseRemaining = CONFIG.pauseTime;
        state.pauseUntil = time + CONFIG.pauseTime;
        setState('pausing');
      } else if (state.direction < 0 && state.x <= minX) {
        state.x = minX;
        state.pauseRemaining = CONFIG.pauseTime;
        state.pauseUntil = time + CONFIG.pauseTime;
        setState('pausing');
      } else {
        setState('walking');
      }
    }

    drawPosition();
    state.lastTime = time;
    animationFrame = requestAnimationFrame(animate);
  }

  function startOrPause() {
    updatePausedState();
  }

  placeForView();
  if (mode === 'patrol') drawPosition();
  root.dataset.paused = String(paused);
  root.dataset.reducedMotion = String(reducedMotion.matches);
  setState('pausing');
  window.addEventListener('resize', () => {
    if (mode === 'patrol') updateBounds();
    else updatePausedState();
  }, {passive: true});
  document.addEventListener('visibilitychange', startOrPause);
  reducedMotion.addEventListener?.('change', startOrPause);
  if (container) container.addEventListener('scroll', () => {
    if (mode === 'patrol') updateBounds();
  }, {passive: true});
  if (chatPanel) {
    new MutationObserver(() => {
      chatOpen = !chatPanel.hidden;
      startOrPause();
    }).observe(chatPanel, {attributes: true, attributeFilter: ['hidden']});
  }
  if (container) {
    new MutationObserver(placeForView).observe(container, {attributes: true, attributeFilter: ['hidden']});
  }
  if (mapArea && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (mode === 'patrol') updateBounds();
      else updatePausedState();
    }).observe(mapArea);
  }
  if (plantAssistant) {
    new MutationObserver(placeForView).observe(plantAssistant, {
      attributes: true,
      attributeFilter: ['data-position'],
    });
  }
  const refreshPatrolBounds = () => {
    if (mode === 'patrol') updateBounds();
  };
  for (const overlay of [
    document.querySelector('#map-summary'),
    document.querySelector('#layers-panel'),
  ]) {
    if (overlay) {
      new MutationObserver(refreshPatrolBounds).observe(overlay, {
        attributes: true,
        attributeFilter: ['hidden', 'data-position'],
      });
    }
  }

  startOrPause();
  Promise.all([preloadImage(CONFIG.walkSheet), preloadImage(CONFIG.idleImage)])
    .then(() => {
      assetsReady = true;
      startOrPause();
    })
    .catch(error => {
      root.style.visibility = 'hidden';
      console.error('No se pudo preparar la animación de la caminante.', error);
    });
})();
