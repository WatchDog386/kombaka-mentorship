// Talks to the backend API and keeps the login token.

import { API_BASE } from './config.js';
import { LS } from './util.js';

const TOKEN_KEY = 'kengele:token';
export const getToken = () => LS.get(TOKEN_KEY);
export function setToken(token) {
  if (token) LS.set(TOKEN_KEY, token);
  else LS.del(TOKEN_KEY);
}

class ApiFailure extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Every call to the backend goes through here: it adds the login token,
// sends JSON and turns error responses into ApiFailure with a readable message.
async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (getToken()) headers.Authorization = 'Bearer ' + getToken();
  let res;
  try {
    res = await fetch(API_BASE + '/api' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiFailure('The school server is not reachable. Check your connection.', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) throw new ApiFailure((data && data.error) || 'The request could not be completed.', res.status);
  return data;
}
// A multipart call, for sending a file. FormData sets its own content type, so the header
// is left off on purpose; the token is added as usual.
async function upload(method, path, form) {
  const headers = {};
  if (getToken()) headers.Authorization = 'Bearer ' + getToken();
  let res;
  try {
    res = await fetch(API_BASE + '/api' + path, { method, headers, body: form });
  } catch (e) {
    throw new ApiFailure('The school server is not reachable. Check your connection.', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) throw new ApiFailure((data && data.error) || 'The upload could not be completed.', res.status);
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
  send: (path, form) => upload('POST', path, form),
  // Downloading a file has to come back as a response, not parsed JSON.
  async download(path) {
    const headers = {};
    if (getToken()) headers.Authorization = 'Bearer ' + getToken();
    const res = await fetch(API_BASE + '/api' + path, { headers });
    if (!res.ok) {
      let msg = 'That file could not be opened.';
      try {
        const d = await res.json();
        if (d && d.error) msg = d.error;
      } catch (e) {
        /* not JSON; keep the plain message */
      }
      throw new ApiFailure(msg, res.status);
    }
    return res;
  },
};
