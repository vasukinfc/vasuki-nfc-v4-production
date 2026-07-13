import {
  MediaApiError,
  addVideoUrl,
  deleteProfileMedia,
  deleteVideoUrl,
  fetchProfileMediaBlob,
  listProfileMedia,
  updateVideoUrl,
  uploadProfileMedia
} from './media-api.js';

const DEFINITIONS = Object.freeze([
  {
    kind: 'logo',
    title: 'Logo',
    help: 'PNG, JPEG or WebP. Maximum 3 MB.',
    accept: 'image/png,image/jpeg,image/webp',
    single: true
  },
  {
    kind: 'coverImage',
    title: 'Cover image',
    help: 'PNG, JPEG or WebP. Maximum 6 MB.',
    accept: 'image/png,image/jpeg,image/webp',
    single: true
  },
  {
    kind: 'paymentQr',
    title: 'Payment QR',
    help: 'PNG, JPEG or WebP. Maximum 3 MB.',
    accept: 'image/png,image/jpeg,image/webp',
    single: true
  },
  {
    kind: 'pdfCatalog',
    title: 'PDF catalog',
    help: 'PDF only. Maximum 12 MB.',
    accept: 'application/pdf',
    single: true
  },
  {
    kind: 'gallery',
    title: 'Gallery images',
    help: 'Up to 12 PNG, JPEG or WebP images.',
    accept: 'image/png,image/jpeg,image/webp',
    single: false
  },
  {
    kind: 'productImage',
    title: 'Product image assets',
    help: 'Image assets only; product editing comes later.',
    accept: 'image/png,image/jpeg,image/webp',
    single: false
  },
  {
    kind: 'teamImage',
    title: 'Team image assets',
    help: 'Image assets only; team editing comes later.',
    accept: 'image/png,image/jpeg,image/webp',
    single: false
  }
]);

const FALLBACK_POLICIES = Object.freeze({
  logo: { maxBytes: 3 * 1024 * 1024, maxItems: 1 },
  coverImage: { maxBytes: 6 * 1024 * 1024, maxItems: 1 },
  paymentQr: { maxBytes: 3 * 1024 * 1024, maxItems: 1 },
  pdfCatalog: { maxBytes: 12 * 1024 * 1024, maxItems: 1 },
  gallery: { maxBytes: 6 * 1024 * 1024, maxItems: 12 },
  productImage: { maxBytes: 6 * 1024 * 1024, maxItems: 20 },
  teamImage: { maxBytes: 6 * 1024 * 1024, maxItems: 20 }
});

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createMediaManager({
  root,
  onUnauthorized = () => {}
}) {
  const sectionHost = root.querySelector('[data-media-sections]');
  const loading = root.querySelector('[data-media-loading]');
  const globalMessage = root.querySelector('[data-media-global-message]');
  const videoForm = root.querySelector('#video-url-form');
  const videoTitle = root.querySelector('#video-title');
  const videoUrl = root.querySelector('#video-url');
  const videoId = root.querySelector('#video-id');
  const videoSubmit = root.querySelector('#video-submit');
  const videoCancel = root.querySelector('#video-cancel');
  const videoList = root.querySelector('[data-video-list]');
  const videoMessage = root.querySelector('[data-video-message]');

  const sections = new Map();
  const objectUrls = new Map();
  const listeners = new Set();
  let media = [];
  let videos = [];
  let policies = FALLBACK_POLICIES;

  function notify() {
    const snapshot = media.map((item) => ({ ...item }));
    listeners.forEach((listener) => listener(snapshot));
  }

  function showError(error, target = globalMessage) {
    if (error instanceof MediaApiError && error.status === 401) {
      onUnauthorized();
      return;
    }
    target.textContent = error.message || 'Media operation failed.';
    target.hidden = false;
  }

  function clearMessage(target) {
    target.textContent = '';
    target.hidden = true;
  }

  function validateFile(file, definition) {
    const policy = policies[definition.kind] || FALLBACK_POLICIES[definition.kind];
    const allowed = definition.accept.split(',');
    if (file.type && !allowed.includes(file.type)) {
      throw new MediaApiError(`${definition.title}: unsupported file type.`, 400);
    }
    if (!file.size) {
      throw new MediaApiError(`${definition.title}: file is empty.`, 400);
    }
    if (file.size > policy.maxBytes) {
      throw new MediaApiError(
        `${definition.title}: maximum size is ${formatBytes(policy.maxBytes)}.`,
        413
      );
    }
  }

  function releaseObjectUrl(mediaId) {
    const url = objectUrls.get(mediaId);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.delete(mediaId);
    }
  }

  function createSection(definition) {
    const section = element('section', 'media-bucket');
    section.dataset.mediaKind = definition.kind;

    const heading = element('div', 'media-bucket__heading');
    const headingText = element('div');
    headingText.append(
      element('h3', '', definition.title),
      element('p', '', definition.help)
    );

    const inputId = `media-input-${definition.kind}`;
    const input = document.createElement('input');
    input.id = inputId;
    input.className = 'media-file-input';
    input.type = 'file';
    input.accept = definition.accept;
    input.multiple = !definition.single;
    input.hidden = true;

    const choose = element('button', 'media-choose-button', 'Choose file');
    choose.type = 'button';
    choose.addEventListener('click', () => input.click());
    heading.append(headingText, choose, input);

    const progressWrap = element('div', 'upload-progress');
    progressWrap.hidden = true;
    const progressText = element('span', '', 'Preparing upload…');
    const progress = document.createElement('progress');
    progress.max = 100;
    progress.value = 0;
    progressWrap.append(progressText, progress);

    const message = element('p', 'media-message');
    message.setAttribute('role', 'status');
    message.hidden = true;
    const list = element('div', 'media-items');

    section.append(heading, progressWrap, message, list);
    sectionHost.append(section);
    sections.set(definition.kind, {
      choose,
      definition,
      input,
      list,
      message,
      progress,
      progressText,
      progressWrap
    });

    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      input.value = '';
      if (!files.length) return;
      await uploadFiles(definition, files);
    });
  }

  async function protectedPreview(item, image) {
    try {
      const blob = await fetchProfileMediaBlob(item.mediaId);
      if (!image.isConnected) return;
      releaseObjectUrl(item.mediaId);
      const url = URL.createObjectURL(blob);
      objectUrls.set(item.mediaId, url);
      image.src = url;
    } catch (error) {
      showError(error);
    }
  }

  function chooseReplacement(definition, item) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = definition.accept;
    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0];
        if (file) await uploadOne(definition, file, item.mediaId);
      },
      { once: true }
    );
    input.click();
  }

  function renderKind(kind) {
    const section = sections.get(kind);
    if (!section) return;
    const items = media.filter((item) => item.kind === kind);
    section.list.replaceChildren();
    section.choose.textContent =
      section.definition.single && items.length ? 'Replace file' : 'Choose file';

    if (!items.length) {
      section.list.append(element('p', 'media-empty', 'No file uploaded.'));
      return;
    }

    items.forEach((item) => {
      releaseObjectUrl(item.mediaId);
      const card = element('article', 'media-item');
      const visual = element('div', 'media-item__visual');
      if (item.mime.startsWith('image/')) {
        const image = document.createElement('img');
        image.alt = `${section.definition.title} preview`;
        visual.append(image);
        protectedPreview(item, image);
      } else {
        visual.append(element('span', 'media-pdf-badge', 'PDF'));
      }

      const details = element('div', 'media-item__details');
      details.append(
        element('strong', '', item.originalName),
        element('span', '', formatBytes(item.size))
      );

      const actions = element('div', 'media-item__actions');
      if (item.mime === 'application/pdf') {
        const view = element('button', 'media-text-button', 'View');
        view.type = 'button';
        view.addEventListener('click', async () => {
          try {
            const blob = await fetchProfileMediaBlob(item.mediaId);
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (error) {
            showError(error, section.message);
          }
        });
        actions.append(view);
      }

      const replace = element('button', 'media-text-button', 'Replace');
      replace.type = 'button';
      replace.addEventListener('click', () =>
        chooseReplacement(section.definition, item)
      );

      const remove = element(
        'button',
        'media-text-button media-text-button--danger',
        'Delete'
      );
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete ${item.originalName}?`)) return;
        clearMessage(section.message);
        try {
          await deleteProfileMedia(item.mediaId);
          releaseObjectUrl(item.mediaId);
          media = media.filter((candidate) => candidate.mediaId !== item.mediaId);
          renderKind(kind);
          notify();
        } catch (error) {
          showError(error, section.message);
        }
      });
      actions.append(replace, remove);
      card.append(visual, details, actions);
      section.list.append(card);
    });
  }

  function setUploading(section, active, percent = 0, fileName = '') {
    section.input.disabled = active;
    section.progressWrap.hidden = !active;
    section.progress.value = percent;
    section.progressText.textContent = active
      ? `${fileName}: ${percent}%`
      : '';
  }

  async function uploadOne(definition, file, replaceMediaId = null) {
    const section = sections.get(definition.kind);
    clearMessage(section.message);
    try {
      validateFile(file, definition);
      setUploading(section, true, 0, file.name);
      const uploaded = await uploadProfileMedia(file, definition.kind, {
        replaceMediaId,
        onProgress(percent) {
          setUploading(section, true, percent, file.name);
        }
      });
      media = media.filter((item) => item.mediaId !== uploaded.mediaId);
      media.push(uploaded);
      renderKind(definition.kind);
      notify();
      section.message.textContent = replaceMediaId
        ? 'File replaced.'
        : 'Upload complete.';
      section.message.hidden = false;
    } catch (error) {
      showError(error, section.message);
    } finally {
      setUploading(section, false);
    }
  }

  async function uploadFiles(definition, files) {
    const existing = media.filter((item) => item.kind === definition.kind);
    if (definition.single) {
      await uploadOne(definition, files[0], existing[0]?.mediaId || null);
      return;
    }
    for (const file of files) {
      await uploadOne(definition, file);
    }
  }

  function resetVideoForm() {
    videoForm.reset();
    videoId.value = '';
    videoSubmit.textContent = 'Add video URL';
    videoCancel.hidden = true;
  }

  function renderVideos() {
    videoList.replaceChildren();
    if (!videos.length) {
      videoList.append(element('p', 'media-empty', 'No video URLs added.'));
      return;
    }

    videos.forEach((video) => {
      const item = element('article', 'video-item');
      const details = element('div', 'video-item__details');
      const link = element('a', '', video.title || video.url);
      link.href = video.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      details.append(link, element('span', '', video.url));

      const actions = element('div', 'media-item__actions');
      const edit = element('button', 'media-text-button', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', () => {
        videoId.value = video.videoId;
        videoTitle.value = video.title;
        videoUrl.value = video.url;
        videoSubmit.textContent = 'Save video URL';
        videoCancel.hidden = false;
        videoUrl.focus();
      });

      const remove = element(
        'button',
        'media-text-button media-text-button--danger',
        'Delete'
      );
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Delete this video URL?')) return;
        try {
          await deleteVideoUrl(video.videoId);
          videos = videos.filter(
            (candidate) => candidate.videoId !== video.videoId
          );
          renderVideos();
          notify();
          if (videoId.value === video.videoId) resetVideoForm();
        } catch (error) {
          showError(error, videoMessage);
        }
      });
      actions.append(edit, remove);
      item.append(details, actions);
      videoList.append(item);
    });
  }

  videoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage(videoMessage);
    videoSubmit.disabled = true;
    const payload = {
      title: videoTitle.value.trim(),
      url: videoUrl.value.trim()
    };
    try {
      if (videoId.value) {
        const updated = await updateVideoUrl(videoId.value, payload);
        videos = videos.map((video) =>
          video.videoId === updated.videoId ? updated : video
        );
      } else {
        videos.push(await addVideoUrl(payload));
      }
      resetVideoForm();
      renderVideos();
      notify();
    } catch (error) {
      showError(error, videoMessage);
    } finally {
      videoSubmit.disabled = false;
    }
  });

  videoCancel.addEventListener('click', resetVideoForm);
  DEFINITIONS.forEach(createSection);

  async function load() {
    clearMessage(globalMessage);
    try {
      const result = await listProfileMedia();
      media = result.media || [];
      videos = result.videos || [];
      policies = result.policies || FALLBACK_POLICIES;
      DEFINITIONS.forEach(({ kind }) => renderKind(kind));
      renderVideos();
      notify();
    } catch (error) {
      showError(error);
    } finally {
      loading.hidden = true;
    }
  }

  return Object.freeze({
    destroy() {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    },
    getMedia() {
      return media.map((item) => ({ ...item }));
    },
    load,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
