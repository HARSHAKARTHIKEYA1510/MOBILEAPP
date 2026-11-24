/**
 * Chat App API Client
 * Seamlessly interfaces with NestJS Chat Backend:
 * - Basic Auth: Basic <username>:<password>
 * - Users, Profiles, Conversations, Messages (cursor pagination)
 */

class ApiClient {
  constructor() {
    const origin =
      window.location.origin &&
      window.location.origin !== 'null' &&
      !window.location.origin.startsWith('file:')
        ? window.location.origin
        : 'http://localhost:3001';

    this.baseUrl = localStorage.getItem('chat_api_url') || origin;
    this.username = localStorage.getItem('chat_username') || 'Harsha';
    this.password = localStorage.getItem('chat_password') || 'harsha@123';
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, '');
    localStorage.setItem('chat_api_url', this.baseUrl);
  }

  setCredentials(username, password) {
    this.username = (username || '').trim();
    this.password = (password || '').trim();
    if (this.username && this.password) {
      localStorage.setItem('chat_username', this.username);
      localStorage.setItem('chat_password', this.password);
    } else {
      localStorage.removeItem('chat_username');
      localStorage.removeItem('chat_password');
    }
  }

  hasCredentials() {
    return Boolean(this.username && this.password);
  }

  clearCredentials() {
    this.username = '';
    this.password = '';
    localStorage.removeItem('chat_username');
    localStorage.removeItem('chat_password');
  }

  getAuthHeader() {
    if (!this.username || !this.password) return {};
    return {
      'Authorization': `Basic ${this.username}:${this.password}`,
    };
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
      ...(options.headers || {}),
    };

    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkError) {
      throw new Error(`Network error connecting to API at ${this.baseUrl}: ${networkError.message}`);
    }

    if (response.status === 401) {
      const err = new Error('Authentication failed: Invalid username or password');
      err.status = 401;
      throw err;
    }

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else {
      data = await response.text().catch(() => null);
    }

    if (!response.ok) {
      const message = (data && data.message)
        ? (Array.isArray(data.message) ? data.message.join(', ') : data.message)
        : `Request failed with status ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  // ─── Users ─────────────────────────────────────────────────────────────

  async getAllUsers() {
    return this.request('/user');
  }

  async getProfile(userId) {
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    return this.request(`/user/profile${query}`);
  }

  // ─── Conversations ─────────────────────────────────────────────────────

  async getConversations() {
    return this.request('/conversation');
  }

  async createConversation({ type, name, participants_ids }) {
    const body = {
      participants_ids,
    };
    if (type) body.type = type;
    if (name) body.name = name;

    return this.request('/conversation', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ─── Messages ──────────────────────────────────────────────────────────

  async getMessages(conversationId, fromMessageCursor) {
    let query = `?conversation_id=${encodeURIComponent(conversationId)}`;
    if (fromMessageCursor) {
      query += `&from_message_cursor=${encodeURIComponent(fromMessageCursor)}`;
    }
    const res = await this.request(`/message${query}`);
    if (res && Array.isArray(res.data)) {
      this._fileCache = this._fileCache || new Map();
      res.data = await Promise.all(
        res.data.map(async (m) => {
          const fileId = m.fileId || m.file?.id;
          if (fileId) {
            if (!this._fileCache.has(fileId)) {
              try {
                const f = await this.request(`/file/${encodeURIComponent(fileId)}`);
                if (f && f.data) {
                  const uri = f.data.startsWith('data:')
                    ? f.data
                    : `data:${f.mimeType || 'image/jpeg'};base64,${f.data}`;
                  this._fileCache.set(fileId, uri);
                }
              } catch {}
            }
            const imgUri = this._fileCache.get(fileId);
            if (imgUri) {
              return {
                ...m,
                content: m.content ? `${imgUri}\n${m.content}` : imgUri,
              };
            }
          }
          return m;
        })
      );
    }
    return res;
  }

  async sendMessage(conversationId, content) {
    return this.request('/message', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: conversationId,
        content: content.trim(),
      }),
    });
  }

  async deleteMessage(messageId) {
    return this.request(`/message/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
  }

  async getArchivedMessages(conversationId) {
    const query = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : '';
    return this.request(`/message/archived${query}`);
  }

  async restoreMessage(messageId) {
    return this.request(`/message/${encodeURIComponent(messageId)}/restore`, {
      method: 'PATCH',
    });
  }
}

window.api = new ApiClient();

