import {
  ProfileApiError,
  clearCustomerSession,
  loadProfileDraft,
  saveProfileDraft
} from './api-client.js';
import { createAutosaveController } from './autosave/autosave-controller.js';
import { createContentManager } from './content/content-manager.js';
import { createMediaManager } from './media/media-manager.js';
import { createPublicationManager } from './publication/publication-manager.js';
import { createLivePreview } from './preview/live-preview.js';
import {
  PROFILE_FIELDS,
  createEditorState
} from './state/editor-state.js';
import {
  validateField,
  validateProfile
} from './validation/profile-validation.js';

const form = document.querySelector('#profile-form');
const editorContent = document.querySelector('#editor-content');
const loadingState = document.querySelector('#loading-state');
const pageMessage = document.querySelector('#page-message');
const saveButton = document.querySelector('#save-button');
const saveStatus = document.querySelector('#save-status');
const undoButton = document.querySelector('#undo-button');
const redoButton = document.querySelector('#redo-button');
const previewRoot = document.querySelector('#live-preview');
const mediaRoot = document.querySelector('#media-manager');
const contentRoot = document.querySelector('#business-content-manager');
const publicationRoot = document.querySelector('#publication-manager');

const touchedFields = new Set();
const editorState = createEditorState();
const livePreview = createLivePreview(previewRoot);
const mediaManager = createMediaManager({
  root: mediaRoot,
  onUnauthorized() {
    clearCustomerSession();
    redirectToLogin();
  }
});
const contentManager = createContentManager({
  root: contentRoot,
  state: editorState,
  mediaManager
});

function redirectToLogin() {
  window.localStorage.setItem('vasukiReturnAfterLogin', '/profile-editor');
  window.location.replace('/login.html');
}

function showPageMessage(message) {
  pageMessage.textContent = message;
  pageMessage.hidden = false;
}

function hidePageMessage() {
  pageMessage.textContent = '';
  pageMessage.hidden = true;
}

function setFieldError(name, message = '') {
  const input = form.elements.namedItem(name);
  const error = document.querySelector(`#${name}-error`);

  if (input) {
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (message) {
      input.setAttribute('aria-describedby', `${name}-error`);
    } else {
      input.removeAttribute('aria-describedby');
    }
  }

  if (error) {
    error.textContent = message;
  }
}

function renderValidation(errors, showAll = false) {
  PROFILE_FIELDS.forEach((field) => {
    const shouldShow = showAll || touchedFields.has(field);
    setFieldError(field, shouldShow ? errors[field] || '' : '');
  });
  contentManager.renderValidation(errors);
}

function populateForm(profile) {
  PROFILE_FIELDS.forEach((field) => {
    const input = form.elements.namedItem(field);
    if (input) {
      input.value = profile[field] || '';
    }
  });
}

function renderState(state, reason) {
  livePreview.render(state.profile);

  undoButton.disabled = !state.canUndo || state.saving;
  redoButton.disabled = !state.canRedo || state.saving;
  saveButton.disabled = state.saving || !state.dirty;
  saveButton.textContent = state.saving ? 'Saving…' : 'Save draft';

  saveStatus.classList.toggle('save-status--dirty', state.dirty && !state.saving);
  saveStatus.classList.toggle('save-status--saving', state.saving);

  if (state.saving) {
    saveStatus.textContent = 'Saving changes…';
  } else if (state.dirty) {
    saveStatus.textContent = 'Unsaved changes';
  } else if (reason === 'initialize') {
    saveStatus.textContent = 'Draft loaded';
  } else {
    saveStatus.textContent = 'All changes saved';
  }

  const shouldPopulate =
    ['initialize', 'undo', 'redo'].includes(reason) ||
    (reason === 'save-completed' && !state.dirty);
  if (shouldPopulate) {
    populateForm(state.profile);
  }
}

function handleApiError(error) {
  if (error instanceof ProfileApiError && error.status === 401) {
    clearCustomerSession();
    redirectToLogin();
    return false;
  }

  if (error instanceof ProfileApiError && error.status === 409) {
    showPageMessage(
      'This draft changed in another window. Reload the page before saving again.'
    );
    return false;
  }

  if (error instanceof ProfileApiError && error.details?.fields) {
    Object.keys(error.details.fields).forEach((field) => touchedFields.add(field));
    renderValidation(error.details.fields);
  }

  showPageMessage(error.message || 'Something went wrong. Please try again.');
  return true;
}

const autosave = createAutosaveController({
  state: editorState,
  validate: validateProfile,
  save: saveProfileDraft,
  onValidation(errors) {
    const fieldsWithErrors = Object.keys(errors);
    fieldsWithErrors.forEach((field) => touchedFields.add(field));
    renderValidation(errors);
    if (fieldsWithErrors.length) {
      showPageMessage('Check the highlighted fields before saving.');
    }
  },
  onSaved() {
    hidePageMessage();
    renderValidation(validateProfile(editorState.getState().profile).errors);
  },
  onError: handleApiError
});
const publicationManager = createPublicationManager({
  root: publicationRoot,
  state: editorState,
  autosave,
  mediaManager,
  onUnauthorized() {
    clearCustomerSession();
    redirectToLogin();
  }
});

editorState.subscribe(renderState);

form.addEventListener('input', (event) => {
  const input = event.target;
  if (!PROFILE_FIELDS.includes(input.name)) {
    return;
  }

  editorState.updateField(input.name, input.value);
  if (touchedFields.has(input.name)) {
    setFieldError(
      input.name,
      validateField(input.name, editorState.getState().profile)
    );
  }
});

form.addEventListener(
  'blur',
  (event) => {
    const input = event.target;
    if (!PROFILE_FIELDS.includes(input.name)) {
      return;
    }

    touchedFields.add(input.name);
    setFieldError(
      input.name,
      validateField(input.name, editorState.getState().profile)
    );
  },
  true
);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hidePageMessage();

  const validation = validateProfile(editorState.getState().profile);
  PROFILE_FIELDS.forEach((field) => touchedFields.add(field));
  renderValidation(validation.errors, true);

  if (!validation.valid) {
    showPageMessage('Check the highlighted fields before saving.');
    const firstInvalidField = PROFILE_FIELDS.find(
      (field) => validation.errors[field]
    );
    form.elements.namedItem(firstInvalidField)?.focus();
    return;
  }

  await autosave.saveNow();
});

undoButton.addEventListener('click', () => {
  hidePageMessage();
  editorState.undo();
  renderValidation(validateProfile(editorState.getState().profile).errors);
});

redoButton.addEventListener('click', () => {
  hidePageMessage();
  editorState.redo();
  renderValidation(validateProfile(editorState.getState().profile).errors);
});

document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === 'z' && event.shiftKey) {
    if (editorState.getState().canRedo) {
      event.preventDefault();
      editorState.redo();
    }
    return;
  }

  if (key === 'z' && editorState.getState().canUndo) {
    event.preventDefault();
    editorState.undo();
    return;
  }

  if (key === 'y' && editorState.getState().canRedo) {
    event.preventDefault();
    editorState.redo();
  }
});

window.addEventListener('beforeunload', (event) => {
  const state = editorState.getState();
  if (!state.dirty && !state.saving) {
    return;
  }

  event.preventDefault();
  event.returnValue = '';
});

window.addEventListener('pagehide', () => {
  mediaManager.destroy();
  publicationManager.destroy();
});

async function initialise() {
  try {
    const result = await loadProfileDraft();
    editorState.initialize(result.profile, result.version);
    loadingState.hidden = true;
    editorContent.hidden = false;
    await Promise.all([mediaManager.load(), publicationManager.load()]);
  } catch (error) {
    loadingState.hidden = true;
    handleApiError(error);
  }
}

initialise();
