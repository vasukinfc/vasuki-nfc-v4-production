/**
 * Predictable in-memory state for the profile editor.
 *
 * The state engine owns draft history and server version tracking. It contains
 * no DOM or network code, which keeps undo/redo and autosave behavior testable.
 */

import {
  CONTENT_FIELDS,
  normalizeBusinessContent
} from '../content/content-schema.js';

export const PROFILE_FIELDS = Object.freeze([
  'businessName',
  'name',
  'designation',
  'phone',
  'whatsapp',
  'email',
  'website',
  'address',
  'googleMaps'
]);

function emptyProfile() {
  return {
    ...Object.fromEntries(PROFILE_FIELDS.map((field) => [field, ''])),
    ...normalizeBusinessContent({})
  };
}

function cloneProfile(profile = {}) {
  return {
    ...Object.fromEntries(
      PROFILE_FIELDS.map((field) => [field, String(profile[field] ?? '')])
    ),
    ...JSON.parse(JSON.stringify(normalizeBusinessContent(profile)))
  };
}

function profilesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createEditorState({
  historyLimit = 60,
  coalesceMilliseconds = 650,
  now = () => Date.now()
} = {}) {
  const listeners = new Set();
  const past = [];
  const future = [];

  let profile = emptyProfile();
  let savedProfile = emptyProfile();
  let version = 0;
  let initialized = false;
  let saving = false;
  let lastEdit = null;

  function snapshot() {
    return Object.freeze({
      profile: Object.freeze(cloneProfile(profile)),
      version,
      initialized,
      saving,
      dirty: !profilesMatch(profile, savedProfile),
      canUndo: past.length > 0,
      canRedo: future.length > 0
    });
  }

  function emit(reason) {
    const state = snapshot();
    listeners.forEach((listener) => listener(state, reason));
  }

  function rememberCurrent() {
    past.push(cloneProfile(profile));
    if (past.length > historyLimit) {
      past.shift();
    }
  }

  function initialize(nextProfile, nextVersion) {
    profile = cloneProfile(nextProfile);
    savedProfile = cloneProfile(nextProfile);
    version = Number(nextVersion) || 0;
    initialized = true;
    saving = false;
    lastEdit = null;
    past.length = 0;
    future.length = 0;
    emit('initialize');
  }

  function updateField(field, value) {
    if (!PROFILE_FIELDS.includes(field)) {
      return false;
    }

    const nextValue = String(value ?? '');
    if (profile[field] === nextValue) {
      return false;
    }

    const timestamp = now();
    const shouldCoalesce =
      lastEdit &&
      lastEdit.field === field &&
      timestamp - lastEdit.timestamp <= coalesceMilliseconds;

    if (!shouldCoalesce) {
      rememberCurrent();
    }

    profile = { ...profile, [field]: nextValue };
    future.length = 0;
    lastEdit = { field, timestamp };
    emit('change');
    return true;
  }

  function updateContent(field, items) {
    if (!CONTENT_FIELDS.includes(field)) {
      return false;
    }

    const normalized = normalizeBusinessContent({
      ...profile,
      [field]: items
    })[field];
    if (JSON.stringify(profile[field]) === JSON.stringify(normalized)) {
      return false;
    }

    rememberCurrent();
    profile = { ...profile, [field]: normalized };
    future.length = 0;
    lastEdit = null;
    emit('content-change');
    return true;
  }

  function undo() {
    if (!past.length || saving) {
      return false;
    }

    future.push(cloneProfile(profile));
    profile = past.pop();
    lastEdit = null;
    emit('undo');
    return true;
  }

  function redo() {
    if (!future.length || saving) {
      return false;
    }

    rememberCurrent();
    profile = future.pop();
    lastEdit = null;
    emit('redo');
    return true;
  }

  function beginSave() {
    if (saving) {
      return false;
    }
    saving = true;
    emit('save-started');
    return true;
  }

  function completeSave(result, submittedSourceProfile) {
    const normalizedSavedProfile = cloneProfile(result.profile);
    const currentStillMatchesSubmission = profilesMatch(
      profile,
      cloneProfile(submittedSourceProfile)
    );

    version = Number(result.version);
    savedProfile = normalizedSavedProfile;
    if (currentStillMatchesSubmission) {
      profile = cloneProfile(normalizedSavedProfile);
    }
    saving = false;
    emit('save-completed');
  }

  function failSave() {
    saving = false;
    emit('save-failed');
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    beginSave,
    completeSave,
    failSave,
    getState: snapshot,
    initialize,
    redo,
    subscribe,
    undo,
    updateContent,
    updateField
  });
}
