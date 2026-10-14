(() => {
  const toggle = document.querySelector('#theme-toggle');
  if (!toggle) return;

  const storageKey = 'fruticebada-theme';
  const applyTheme = theme => {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', `Activar modo ${isDark ? 'claro' : 'oscuro'}`);
    toggle.querySelector('[data-theme-icon]').textContent = isDark ? '☀' : '☾';
    toggle.querySelector('[data-theme-label]').textContent = `Modo ${isDark ? 'claro' : 'oscuro'}`;
  };

  try {
    applyTheme(window.localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light');
  } catch (error) {
    console.error('No se pudo leer la preferencia de tema guardada.', error);
    applyTheme('light');
  }

  toggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch (error) {
      console.error('No se pudo guardar la preferencia de tema.', error);
    }
  });
})();
