/**
 * Authenticated API client for profile media.
 *
 * Binary files use XMLHttpRequest so upload progress is observable. Protected
 * media is fetched as a blob because image elements cannot attach bearer tokens.
 */

const API_BASE = '/api/profile-editor';
const TOKEN_KEY = 'vasukiAuthToken';

export class MediaApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = 'MediaApiError';
    this.status = status;
    this.code = code;
  }
}

function token() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function requireToken() {
  const value = token();
  if (!value) {
    throw new MediaApiError('Please sign in to manage profile media.', 401);
  }
  return value;
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${requireToken()}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MediaApiError(
      payload.error || 'The media request could not be completed.',
      response.status,
      payload.code
    );
  }
  return payload;
}

export function listProfileMedia() {
  return jsonRequest('/media');
}

export function uploadProfileMedia(
  file,
  kind,
  { replaceMediaId = null, onProgress = () => {} } = {}
) {
  return new Promise((resolve, reject) => {
    let authToken;
    try {
      authToken = requireToken();
    } catch (error) {
      reject(error);
      return;
    }

    const request = new XMLHttpRequest();
    const path = replaceMediaId
      ? `/media/${encodeURIComponent(replaceMediaId)}`
      : '/media';
    request.open(replaceMediaId ? 'PUT' : 'POST', `${API_BASE}${path}`);
    request.responseType = 'json';
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader('Authorization', `Bearer ${authToken}`);
    request.setRequestHeader(
      'Content-Type',
      file.type || 'application/octet-stream'
    );
    request.setRequestHeader('X-Media-Kind', encodeURIComponent(kind));
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener('load', () => {
      const payload =
        request.response && typeof request.response === 'object'
          ? request.response
          : {};
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve(payload);
        return;
      }
      reject(
        new MediaApiError(
          payload.error || 'Upload failed. Please try again.',
          request.status,
          payload.code
        )
      );
    });
    request.addEventListener('error', () => {
      reject(new MediaApiError('Upload connection failed.', 0));
    });
    request.addEventListener('abort', () => {
      reject(new MediaApiError('Upload was cancelled.', 0));
    });
    request.send(file);
  });
}

export function deleteProfileMedia(mediaId) {
  return jsonRequest(`/media/${encodeURIComponent(mediaId)}`, {
    method: 'DELETE'
  });
}

export async function fetchProfileMediaBlob(mediaId) {
  const response = await fetch(
    `${API_BASE}/media/${encodeURIComponent(mediaId)}/content`,
    {
      headers: { Authorization: `Bearer ${requireToken()}` },
      cache: 'no-store'
    }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new MediaApiError(
      payload.error || 'Unable to load protected media.',
      response.status,
      payload.code
    );
  }
  return response.blob();
}

export function addVideoUrl(video) {
  return jsonRequest('/videos', {
    method: 'POST',
    body: JSON.stringify(video)
  });
}

export function updateVideoUrl(videoId, video) {
  return jsonRequest(`/videos/${encodeURIComponent(videoId)}`, {
    method: 'PUT',
    body: JSON.stringify(video)
  });
}

export function deleteVideoUrl(videoId) {
  return jsonRequest(`/videos/${encodeURIComponent(videoId)}`, {
    method: 'DELETE'
  });
}
