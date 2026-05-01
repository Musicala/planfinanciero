import { escapeHtml } from '../utils/dom.js';

let resolver = null;

export function openModal(content) {
  closeModal(false);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<section class="modal">${content}</section>`;

  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal(false);
  });

  backdrop
    .querySelectorAll('[data-close-modal]')
    .forEach((button) => {
      button.addEventListener('click', () => closeModal(false));
    });

  return backdrop;
}

export function closeModal(result = false) {
  document.querySelector('.modal-backdrop')?.remove();

  if (resolver) {
    const resolve = resolver;
    resolver = null;
    resolve(result);
  }
}

export function confirmModal(title, message) {
  return new Promise((resolve) => {
    const modal = openModal(`
      <div class="modal-head">
        <h3>${escapeHtml(title)}</h3>
        <button class="btn btn-ghost" data-close-modal type="button">Cerrar</button>
      </div>

      <div class="modal-body">
        <p>${escapeHtml(message)}</p>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" data-close-modal type="button">Cancelar</button>
        <button class="btn btn-danger" id="confirmYes" type="button">Confirmar</button>
      </div>
    `);

    resolver = resolve;

    modal.querySelector('#confirmYes')?.addEventListener('click', () => {
      closeModal(true);
    });
  });
}