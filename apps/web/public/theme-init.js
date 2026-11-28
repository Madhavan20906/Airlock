/* Applies the saved Paper/Darkroom choice before first paint (external file: the CSP blocks inline scripts). */
try { var p = localStorage.getItem('tandem-theme-pref') || 'system'; document.documentElement.dataset.theme = p === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p; } catch (e) {}
