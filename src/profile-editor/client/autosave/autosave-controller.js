/**
 * Debounced, single-flight autosave coordinator.
 *
 * A save always uses the version captured with its source draft. If editing
 * continues while the request is running, another save is queued afterward.
 */

export function createAutosaveController({
  state,
  validate,
  save,
  delay = 1200,
  onValidation = () => {},
  onSaved = () => {},
  onError = () => true
}) {
  let timer = null;
  let inFlight = null;
  let destroyed = false;
  let paused = false;

  function clearTimer() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    clearTimer();
    const current = state.getState();
    if (
      destroyed ||
      paused ||
      !current.initialized ||
      !current.dirty ||
      current.saving
    ) {
      return;
    }

    timer = window.setTimeout(() => {
      timer = null;
      performSave(false);
    }, delay);
  }

  async function performSave(manual) {
    clearTimer();

    if (inFlight) {
      await inFlight;
      if (state.getState().dirty && !paused) {
        return performSave(manual);
      }
      return null;
    }

    const source = state.getState();
    if (destroyed || paused || !source.initialized || !source.dirty) {
      return null;
    }

    const validation = validate(source.profile);
    onValidation(validation.errors);
    if (!validation.valid) {
      return null;
    }

    state.beginSave();
    inFlight = (async () => {
      let failed = false;
      try {
        const result = await save(validation.profile, source.version);
        state.completeSave(result, source.profile);
        onSaved({ manual, result });
        return result;
      } catch (error) {
        failed = true;
        state.failSave();
        paused = onError(error) === false;
        return null;
      } finally {
        inFlight = null;
        if (!failed && state.getState().dirty && !paused) {
          schedule();
        }
      }
    })();

    return inFlight;
  }

  const unsubscribe = state.subscribe((current, reason) => {
    if (['change', 'content-change', 'undo', 'redo'].includes(reason)) {
      if (current.dirty) {
        schedule();
      } else {
        clearTimer();
      }
    }
  });

  return Object.freeze({
    cancel() {
      clearTimer();
    },
    destroy() {
      destroyed = true;
      clearTimer();
      unsubscribe();
    },
    resume() {
      paused = false;
      schedule();
    },
    saveNow() {
      return performSave(true);
    }
  });
}
