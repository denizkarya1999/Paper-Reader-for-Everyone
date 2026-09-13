// Apply the saved appearance before the first paint, including in the cat window.
(() => {
  function apply() {
    let theme = 'light';
    try { if (localStorage.getItem('paper-reader-theme') === 'dark') theme = 'dark'; } catch { /* Reading stays available without local storage. */ }
    document.documentElement.dataset.theme = theme;
  }
  apply();
  window.addEventListener('storage', event => { if (event.key === 'paper-reader-theme' || event.key === null) apply(); });
})();
