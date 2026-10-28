/**
 * Centralized API Client Wrapper
 * Handles JSON payload serialization, API Key injection, and error normalization.
 */

export const api = {
  getApiKey() {
    return localStorage.getItem('socialpulse_api_key') || '';
  },

  setApiKey(key) {
    if (key) {
      localStorage.setItem('socialpulse_api_key', key.trim());
    } else {
      localStorage.removeItem('socialpulse_api_key');
    }
  },

  getHeaders(customHeaders = {}) {
    const headers = { ...customHeaders };
    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    return headers;
  },

  async request(url, options = {}) {
    const headers = this.getHeaders(options.headers || {});
    const config = {
      ...options,
      headers
    };

    const res = await fetch(url, config);
    const contentType = res.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const errMsg = (data && data.error) ? data.error : `HTTP ${res.status}: ${res.statusText}`;
      const err = new Error(errMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  },

  get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  },

  post(url, body, options = {}) {
    const isFormData = body instanceof FormData;
    const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
    const payload = isFormData ? body : JSON.stringify(body);

    return this.request(url, {
      ...options,
      method: 'POST',
      headers: { ...headers, ...(options.headers || {}) },
      body: payload
    });
  },

  put(url, body, options = {}) {
    const isFormData = body instanceof FormData;
    const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
    const payload = isFormData ? body : JSON.stringify(body);

    return this.request(url, {
      ...options,
      method: 'PUT',
      headers: { ...headers, ...(options.headers || {}) },
      body: payload
    });
  },

  patch(url, body, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: JSON.stringify(body)
    });
  },

  delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }
};
