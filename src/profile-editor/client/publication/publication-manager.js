import {
  ProfileApiError,
  loadPublicationStatus,
  publishProfileDraft
} from '../api-client.js';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

function suggestedSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function createPublicationManager({
  root,
  state,
  autosave,
  mediaManager,
  onUnauthorized = () => {}
}) {
  const badge = root.querySelector('[data-publication-badge]');
  const summary = root.querySelector('[data-publication-summary]');
  const slugInput = root.querySelector('#publication-slug');
  const publishButton = root.querySelector('#publish-profile-button');
  const publicLink = root.querySelector('#published-card-link');
  const message = root.querySelector('[data-publication-message]');

  let publication = null;
  let busy = false;
  let slugTouched = false;
  let refreshTimer = null;

  function showMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle('publication-message--error', error);
    message.hidden = !text;
  }

  function currentHasChanges() {
    if (!publication || publication.status !== 'published') return false;
    const current = state.getState();
    return (
      publication.hasUnpublishedChanges ||
      current.dirty ||
      current.version !== publication.publishedVersion
    );
  }

  function render() {
    const current = state.getState();
    const isPublished = publication?.status === 'published';
    const hasChanges = currentHasChanges();

    badge.dataset.status = isPublished
      ? hasChanges
        ? 'changes'
        : 'published'
      : 'unpublished';
    badge.textContent = isPublished
      ? hasChanges
        ? 'Published · changes pending'
        : 'Published'
      : 'Unpublished';
    summary.textContent = isPublished
      ? hasChanges
        ? 'Your public card is live, but it does not include the latest draft or media changes.'
        : 'Your public card matches the latest saved draft.'
      : 'Choose your permanent card URL and publish when ready.';

    if (isPublished && publication.slug) {
      slugInput.value = publication.slug;
      slugInput.disabled = true;
      publicLink.href = publication.publicUrl;
      publicLink.hidden = false;
      publicLink.textContent = 'View public card';
    } else {
      slugInput.disabled = false;
      publicLink.hidden = true;
      if (!slugTouched && !slugInput.value) {
        slugInput.value = suggestedSlug(
          current.profile.businessName || current.profile.name
        );
      }
    }

    publishButton.disabled = busy || current.saving || !current.initialized;
    publishButton.textContent = busy
      ? 'Publishing…'
      : isPublished
        ? 'Publish updates'
        : 'Publish profile';
  }

  function handleError(error) {
    if (error instanceof ProfileApiError && error.status === 401) {
      onUnauthorized();
      return;
    }
    showMessage(error.message || 'Unable to publish this profile.', true);
  }

  async function load() {
    try {
      publication = await loadPublicationStatus();
      render();
    } catch (error) {
      handleError(error);
    }
  }

  slugInput.addEventListener('input', () => {
    slugTouched = true;
    slugInput.value = suggestedSlug(slugInput.value);
    showMessage('');
  });

  publishButton.addEventListener('click', async () => {
    showMessage('');
    const slug = String(slugInput.value || '').trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) {
      showMessage(
        'Use 2–64 lowercase letters, numbers or hyphens for the card URL.',
        true
      );
      slugInput.focus();
      return;
    }

    busy = true;
    render();
    try {
      await autosave.saveNow();
      const current = state.getState();
      if (current.dirty || current.saving) {
        throw new Error('Save the highlighted draft fields before publishing.');
      }
      publication = await publishProfileDraft(slug, current.version);
      showMessage('Published snapshot updated successfully.');
    } catch (error) {
      handleError(error);
    } finally {
      busy = false;
      render();
    }
  });

  state.subscribe(() => render());
  mediaManager.subscribe(() => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(load, 150);
  });

  return Object.freeze({
    destroy() {
      window.clearTimeout(refreshTimer);
    },
    load
  });
}
