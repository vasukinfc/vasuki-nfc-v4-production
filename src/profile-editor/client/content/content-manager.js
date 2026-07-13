import {
  CONTENT_LIMITS,
  validateContentItem
} from './content-schema.js';

const MODULES = Object.freeze([
  {
    field: 'products',
    title: 'Products',
    itemName: 'product',
    summary: 'name',
    fields: [
      { name: 'name', label: 'Product name', maxLength: 120 },
      { name: 'description', label: 'Description', maxLength: 500, type: 'textarea' },
      { name: 'price', label: 'Price or label', maxLength: 40, placeholder: '₹499 or Contact us' },
      { name: 'imageMediaId', label: 'Product image', type: 'media', mediaKind: 'productImage' }
    ]
  },
  {
    field: 'services',
    title: 'Services',
    itemName: 'service',
    summary: 'name',
    fields: [
      { name: 'name', label: 'Service name', maxLength: 120 },
      { name: 'description', label: 'Description', maxLength: 500, type: 'textarea' },
      { name: 'price', label: 'Price or label', maxLength: 40, placeholder: 'From ₹999 or Contact us' }
    ]
  },
  {
    field: 'socialLinks',
    title: 'Social Links',
    itemName: 'social link',
    summary: 'platform',
    fields: [
      { name: 'platform', label: 'Platform', maxLength: 60, placeholder: 'Instagram' },
      { name: 'url', label: 'Profile URL', maxLength: 500, type: 'url', placeholder: 'https://…' }
    ]
  },
  {
    field: 'teamMembers',
    title: 'Team Members',
    itemName: 'team member',
    summary: 'name',
    fields: [
      { name: 'name', label: 'Name', maxLength: 100 },
      { name: 'role', label: 'Role', maxLength: 100 },
      { name: 'bio', label: 'Bio', maxLength: 500, type: 'textarea' },
      { name: 'imageMediaId', label: 'Team image', type: 'media', mediaKind: 'teamImage' }
    ]
  },
  {
    field: 'customButtons',
    title: 'Custom Buttons',
    itemName: 'button',
    summary: 'label',
    fields: [
      { name: 'label', label: 'Button label', maxLength: 80 },
      { name: 'url', label: 'Destination URL', maxLength: 500, type: 'url', placeholder: 'https://…' }
    ]
  }
]);

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function itemId() {
  return `item-${crypto.randomUUID()}`;
}

export function createContentManager({ root, state, mediaManager }) {
  const panelHost = root.querySelector('[data-content-panels]');
  const panels = new Map();
  let dragging = null;

  function mediaItems(kind) {
    return mediaManager.getMedia().filter((item) => item.kind === kind);
  }

  function updateMediaSelect(select, fieldDefinition) {
    const current = select.value;
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'No image';
    select.append(empty);
    mediaItems(fieldDefinition.mediaKind).forEach((media) => {
      const option = document.createElement('option');
      option.value = media.mediaId;
      option.textContent = media.originalName;
      select.append(option);
    });
    select.value = current;
  }

  function createField(panel, definition) {
    const wrapper = element('div', 'form-field');
    const id = `${panel.definition.field}-${definition.name}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = definition.label;

    let input;
    if (definition.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else if (definition.type === 'media') {
      input = document.createElement('select');
      updateMediaSelect(input, definition);
      panel.mediaSelects.push({ definition, select: input });
    } else {
      input = document.createElement('input');
      input.type = definition.type || 'text';
    }
    input.id = id;
    input.name = definition.name;
    if (definition.maxLength) input.maxLength = definition.maxLength;
    if (definition.placeholder) input.placeholder = definition.placeholder;

    const error = element('span', 'field-error');
    error.dataset.contentFieldError = definition.name;
    wrapper.append(label, input, error);
    return wrapper;
  }

  function closeEditor(panel) {
    panel.form.reset();
    panel.editingId = null;
    panel.form.hidden = true;
    panel.addButton.hidden = false;
    panel.formTitle.textContent = '';
    panel.fieldErrors.forEach((error) => {
      error.textContent = '';
    });
  }

  function openEditor(panel, item = null) {
    panel.form.reset();
    panel.editingId = item?.id || null;
    panel.formTitle.textContent = item
      ? `Edit ${panel.definition.itemName}`
      : `Add ${panel.definition.itemName}`;
    panel.definition.fields.forEach((field) => {
      const input = panel.form.elements.namedItem(field.name);
      input.value = item?.[field.name] || '';
    });
    panel.fieldErrors.forEach((error) => {
      error.textContent = '';
    });
    panel.form.hidden = false;
    panel.addButton.hidden = true;
    panel.form.elements.namedItem(panel.definition.fields[0].name)?.focus();
  }

  function itemMeta(definition, item) {
    if (definition.field === 'products' || definition.field === 'services') {
      return item.price || item.description;
    }
    if (definition.field === 'teamMembers') {
      return item.role || item.bio;
    }
    return item.url || '';
  }

  function moveItem(field, id, direction) {
    const items = [...state.getState().profile[field]];
    const index = items.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    state.updateContent(field, items);
  }

  function reorderItem(field, sourceId, targetId) {
    if (sourceId === targetId) return;
    const items = [...state.getState().profile[field]];
    const sourceIndex = items.findIndex((item) => item.id === sourceId);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = items.splice(sourceIndex, 1);
    items.splice(targetIndex, 0, moved);
    state.updateContent(field, items);
  }

  function renderPanel(field) {
    const panel = panels.get(field);
    const items = state.getState().profile[field] || [];
    panel.count.textContent = `${items.length}/${CONTENT_LIMITS[field]}`;
    panel.addButton.disabled = items.length >= CONTENT_LIMITS[field];
    panel.list.replaceChildren();

    if (!items.length) {
      panel.list.append(
        element('p', 'content-empty', `No ${panel.definition.title.toLowerCase()} added.`)
      );
      return;
    }

    items.forEach((item, index) => {
      const card = element('article', 'content-item');
      card.draggable = true;
      card.dataset.itemId = item.id;
      card.addEventListener('dragstart', (event) => {
        dragging = { field, id: item.id };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.id);
        card.classList.add('content-item--dragging');
      });
      card.addEventListener('dragend', () => {
        dragging = null;
        card.classList.remove('content-item--dragging');
      });
      card.addEventListener('dragover', (event) => {
        if (dragging?.field === field) event.preventDefault();
      });
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        if (dragging?.field === field) {
          reorderItem(field, dragging.id, item.id);
        }
      });

      const drag = element('span', 'content-drag-handle', '⋮⋮');
      drag.title = 'Drag to reorder';
      drag.setAttribute('aria-hidden', 'true');

      const details = element('div', 'content-item__details');
      details.append(
        element('strong', '', item[panel.definition.summary] || 'Untitled'),
        element('span', '', itemMeta(panel.definition, item))
      );
      if (item.imageMediaId) {
        const media = mediaManager
          .getMedia()
          .find((candidate) => candidate.mediaId === item.imageMediaId);
        if (media) details.append(element('small', '', `Image: ${media.originalName}`));
      }

      const actions = element('div', 'content-item__actions');
      const up = element('button', 'content-icon-button', '↑');
      up.type = 'button';
      up.title = 'Move up';
      up.setAttribute('aria-label', `Move ${item[panel.definition.summary]} up`);
      up.disabled = index === 0;
      up.addEventListener('click', () => moveItem(field, item.id, -1));

      const down = element('button', 'content-icon-button', '↓');
      down.type = 'button';
      down.title = 'Move down';
      down.setAttribute('aria-label', `Move ${item[panel.definition.summary]} down`);
      down.disabled = index === items.length - 1;
      down.addEventListener('click', () => moveItem(field, item.id, 1));

      const edit = element('button', 'media-text-button', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', () => openEditor(panel, item));

      const remove = element(
        'button',
        'media-text-button media-text-button--danger',
        'Delete'
      );
      remove.type = 'button';
      remove.addEventListener('click', () => {
        if (!window.confirm(`Delete ${item[panel.definition.summary]}?`)) return;
        closeEditor(panel);
        state.updateContent(
          field,
          items.filter((candidate) => candidate.id !== item.id)
        );
      });
      actions.append(up, down, edit, remove);
      card.append(drag, details, actions);
      panel.list.append(card);
    });
  }

  function createCollectionPanel(definition) {
    const panel = {
      definition,
      editingId: null,
      mediaSelects: []
    };
    const section = element('section', 'content-module');
    section.dataset.contentModule = definition.field;
    const heading = element('div', 'content-module__heading');
    const headingText = element('div');
    headingText.append(element('h3', '', definition.title));
    panel.count = element('span', 'content-count', `0/${CONTENT_LIMITS[definition.field]}`);
    headingText.append(panel.count);
    panel.addButton = element('button', 'media-choose-button', `Add ${definition.itemName}`);
    panel.addButton.type = 'button';
    panel.addButton.addEventListener('click', () => openEditor(panel));
    heading.append(headingText, panel.addButton);

    panel.message = element('p', 'media-message');
    panel.message.hidden = true;
    panel.form = element('form', 'content-form');
    panel.form.noValidate = true;
    panel.form.hidden = true;
    panel.formTitle = element('h4');
    panel.form.append(panel.formTitle);
    const fields = element('div', 'content-form__fields');
    definition.fields.forEach((field) => fields.append(createField(panel, field)));
    panel.fieldErrors = fields.querySelectorAll('[data-content-field-error]');

    const formActions = element('div', 'content-form__actions');
    const save = element('button', 'save-button', 'Save item');
    save.type = 'submit';
    const cancel = element('button', 'history-button', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => closeEditor(panel));
    formActions.append(save, cancel);
    panel.form.append(fields, formActions);

    panel.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const raw = { id: panel.editingId || itemId() };
      definition.fields.forEach((field) => {
        raw[field.name] = panel.form.elements.namedItem(field.name).value;
      });
      const validation = validateContentItem(definition.field, raw);
      panel.fieldErrors.forEach((error) => {
        error.textContent = validation.errors[error.dataset.contentFieldError] || '';
      });
      if (!validation.valid) {
        panel.message.textContent = 'Check the highlighted fields.';
        panel.message.hidden = false;
        return;
      }

      const items = [...state.getState().profile[definition.field]];
      const index = items.findIndex((item) => item.id === panel.editingId);
      if (index >= 0) {
        items[index] = validation.item;
      } else {
        items.push(validation.item);
      }
      panel.message.hidden = true;
      closeEditor(panel);
      state.updateContent(definition.field, items);
    });

    panel.list = element('div', 'content-list');
    section.append(heading, panel.message, panel.form, panel.list);
    panelHost.append(section);
    panels.set(definition.field, panel);
  }

  function renderBusinessHours() {
    const panel = panels.get('businessHours');
    const hours = state.getState().profile.businessHours || [];
    panel.list.replaceChildren();
    hours.forEach((item, index) => {
      const row = element('div', 'hours-row');
      const toggleLabel = element('label', 'hours-toggle');
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = item.enabled;
      toggleLabel.append(enabled, document.createTextNode(item.label));

      const open = document.createElement('input');
      open.type = 'time';
      open.value = item.open;
      open.disabled = !item.enabled;
      open.setAttribute('aria-label', `${item.label} opening time`);

      const close = document.createElement('input');
      close.type = 'time';
      close.value = item.close;
      close.disabled = !item.enabled;
      close.setAttribute('aria-label', `${item.label} closing time`);

      const update = () => {
        const next = hours.map((candidate, candidateIndex) =>
          candidateIndex === index
            ? {
                ...candidate,
                enabled: enabled.checked,
                open: open.value || candidate.open,
                close: close.value || candidate.close
              }
            : candidate
        );
        state.updateContent('businessHours', next);
      };
      enabled.addEventListener('change', update);
      open.addEventListener('change', update);
      close.addEventListener('change', update);
      row.append(toggleLabel, open, element('span', 'hours-separator', 'to'), close);
      panel.list.append(row);
    });
  }

  function createHoursPanel() {
    const section = element('section', 'content-module');
    section.dataset.contentModule = 'businessHours';
    const heading = element('div', 'content-module__heading');
    const headingText = element('div');
    headingText.append(
      element('h3', '', 'Business Hours'),
      element('span', 'content-count', '7 days')
    );
    heading.append(headingText);
    const message = element('p', 'media-message');
    message.hidden = true;
    const list = element('div', 'hours-list');
    section.append(heading, message, list);
    panelHost.append(section);
    panels.set('businessHours', { list, message });
  }

  MODULES.forEach(createCollectionPanel);
  createHoursPanel();

  function renderAll() {
    MODULES.forEach(({ field }) => renderPanel(field));
    renderBusinessHours();
  }

  function renderValidation(errors = {}) {
    [...MODULES, { field: 'businessHours' }].forEach(({ field }) => {
      const panel = panels.get(field);
      const entry = Object.entries(errors).find(([path]) =>
        path.startsWith(`${field}.`)
      );
      panel.message.textContent = entry?.[1] || '';
      panel.message.hidden = !entry;
    });
  }

  state.subscribe((current, reason) => {
    if (
      current.initialized &&
      ['initialize', 'content-change', 'undo', 'redo', 'save-completed'].includes(reason)
    ) {
      renderAll();
    }
  });

  mediaManager.subscribe(() => {
    panels.forEach((panel) => {
      panel.mediaSelects?.forEach(({ definition, select }) =>
        updateMediaSelect(select, definition)
      );
    });
    if (state.getState().initialized) renderAll();
  });

  return Object.freeze({
    renderValidation
  });
}
