const STORAGE_KEY = 'musicala_hints_dismissed';

function dismissedIds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

// Caja de onboarding contextual: se muestra hasta que el usuario la descarta (persistido en localStorage).
export function hintBox(id, text) {
  if (dismissedIds().includes(id)) return '';
  return `<section class="hint" data-hint="${id}">
    <p>💡 ${text}</p>
    <button type="button" class="hint-close" data-hint-close="${id}">Entendido</button>
  </section>`;
}

export function bindHints(root) {
  root.querySelectorAll('[data-hint-close]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.hintClose;
    const list = dismissedIds();
    if (!list.includes(id)) list.push(id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch { /* sin almacenamiento disponible: la pista volvera a aparecer */ }
    root.querySelector(`[data-hint="${id}"]`)?.remove();
  }));
}
