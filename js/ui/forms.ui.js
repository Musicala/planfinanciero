import { escapeHtml } from '../utils/dom.js';

export function formModal({ title, fields, submitLabel, onSubmit, onReady, extraActions = '' }) {
  setTimeout(() => {
    const form = document.querySelector('#dynamicForm');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = {};
      fields.forEach(([name, _label, type]) => {
        if (['section', 'help', 'separator', 'service-summary'].includes(type)) return;
        const input = form.elements[name];
        if (!input) return;
        values[name] = type === 'checkbox' ? input.checked : input.value;
      });
      await onSubmit(values);
    });
    if (form && typeof onReady === 'function') onReady(form);
  });
  return `
    <div class="modal-head"><h3>${escapeHtml(title)}</h3><button class="btn btn-ghost" data-close-modal type="button">Cerrar</button></div>
    <form id="dynamicForm">
      <div class="modal-body form-grid">
        ${fields.map(renderField).join('')}
      </div>
      <div class="modal-actions">
        ${extraActions}
        <button class="btn btn-secondary" data-close-modal type="button">Cancelar</button>
        <button class="btn btn-primary" type="submit">${escapeHtml(submitLabel)}</button>
      </div>
    </form>`;
}

function renderField([name, label, type, value, required, options]) {
  const wide = type === 'textarea' ? ' field-wide' : '';
  if (type === 'section') return `<div class="form-section field-wide" data-field="${escapeHtml(name)}"><h4>${escapeHtml(label)}</h4>${value ? `<p>${escapeHtml(value)}</p>` : ''}</div>`;
  if (type === 'help') return `<p class="form-help field-wide" data-field="${escapeHtml(name)}">${escapeHtml(value || label)}</p>`;
  if (type === 'separator') return '<div class="form-separator field-wide"></div>';
  if (type === 'service-summary') return `<div class="service-summary field-wide" data-service-summary><h4>${escapeHtml(label)}</h4><div class="service-summary-grid"></div></div>`;
  if (type === 'month-multiselect') {
    const selected = Array.isArray(value) ? value.map(String) : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `<fieldset class="field field-wide month-picker" data-field="${escapeHtml(name)}">
      <legend>${escapeHtml(label)}</legend>
      <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(selected.join(','))}">
      <div class="month-picker-grid">
        ${months.map((month, index) => {
          const monthValue = String(index + 1);
          return `<label><input type="checkbox" value="${monthValue}" ${selected.includes(monthValue) ? 'checked' : ''}> <span>${escapeHtml(month)}</span></label>`;
        }).join('')}
      </div>
      ${options?.help ? `<small>${escapeHtml(options.help)}</small>` : ''}
    </fieldset>`;
  }
  if (type === 'select') {
    const normalizedOptions = (options || []).map((option) => typeof option === 'object' ? option : { value: option, label: option });
    return `<label class="field${wide}" data-field="${escapeHtml(name)}"><span>${escapeHtml(label)}</span><select name="${name}" ${required ? 'required' : ''}>${normalizedOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
  }
  if (type === 'textarea') return `<label class="field field-wide" data-field="${escapeHtml(name)}"><span>${escapeHtml(label)}</span><textarea name="${name}" ${required ? 'required' : ''}>${escapeHtml(value || '')}</textarea></label>`;
  if (type === 'checkbox') return `<label class="field" data-field="${escapeHtml(name)}"><span>${escapeHtml(label)}</span><input type="checkbox" name="${name}" ${value ? 'checked' : ''}></label>`;
  return `<label class="field${wide}" data-field="${escapeHtml(name)}"><span>${escapeHtml(label)}</span><input type="${type}" name="${name}" value="${escapeHtml(value ?? '')}" ${required ? 'required' : ''} ${type === 'number' ? 'step="any"' : ''}></label>`;
}
