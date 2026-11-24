import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ARCHIVE_STORAGE_KEY = 'chat_archived_messages_v2';
const API_PORT = 3001;

function extractHost(candidate) {
  if (!candidate || typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  const withSchemeMatch = trimmed.match(/https?:\/\/([^:/?#]+)/i);
  if (withSchemeMatch && withSchemeMatch[1]) {
    return withSchemeMatch[1];
  }
  const hostPortMatch = trimmed.match(/^([a-zA-Z0-9.-]+):\d+/);
  if (hostPortMatch && hostPortMatch[1]) {
    return hostPortMatch[1];
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function isLoopbackHost(host) {
  return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function getDetectedBackendUrl() {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
      const port = window.location.port || String(API_PORT);
      return `http://${window.location.hostname}:${port === '8081' ? String(API_PORT) : port}`;
    }

    const scriptURL =
      NativeModules?.SourceCode?.getConstants?.()?.scriptURL ||
      NativeModules?.SourceCode?.scriptURL;

    const candidates = [
      Constants?.expoConfig?.hostUri,
      Constants?.expoGoConfig?.debuggerHost,
      Constants?.manifest2?.extra?.expoGo?.debuggerHost,
      Constants?.manifest?.debuggerHost,
      scriptURL,
      Constants?.expoConfig?.extra?.detectedHost,
    ];

    for (const candidate of candidates) {
      const host = extractHost(candidate);
      if (host && !isLoopbackHost(host)) {
        return `http://${host}:${API_PORT}`;
      }
    }

    for (const candidate of candidates) {
      const host = extractHost(candidate);
      if (host) {
        return `http://${host}:${API_PORT}`;
      }
    }
  } catch (e) {
    // Fallback below
  }
  return `http://localhost:${API_PORT}`;
}

class ChatApiService {
  constructor() {
    this.baseUrl = getDetectedBackendUrl();
    this.username = 'Harsha';
    this.password = 'harsha@123';
    this.hasStoredCredentials = true;
    this.initialized = false;
    this.fileDataUriCache = new Map();
  }

  async init() {
    if (this.initialized) return;
    const detectedUrl = getDetectedBackendUrl();
    try {
      const isCustomUrl = (await AsyncStorage.getItem('chat_api_url_custom')) === 'true';
      const storedUrl = await AsyncStorage.getItem('chat_api_url');
      const storedUser = await AsyncStorage.getItem('chat_username');
      const storedPass = await AsyncStorage.getItem('chat_password');

      const storedUrlHost = extractHost(storedUrl);
      const detectedIsLan = !isLoopbackHost(extractHost(detectedUrl));
      const useStoredCustom =
        isCustomUrl &&
        storedUrl &&
        !(detectedIsLan && isLoopbackHost(storedUrlHost));

      this.baseUrl = useStoredCustom ? storedUrl : detectedUrl;
      if (isCustomUrl && !useStoredCustom) {
        await AsyncStorage.removeItem('chat_api_url');
        await AsyncStorage.removeItem('chat_api_url_custom');
      }
      if (storedUser && storedPass) {
        this.username = storedUser;
        this.password = storedPass;
        this.hasStoredCredentials = true;
      }
    } catch (e) {
      this.baseUrl = detectedUrl;
      console.warn('Failed to load credentials from storage', e);
    }
    this.initialized = true;
  }

  async setServerUrl(url) {
    const cleaned = (url || '').trim().replace(/\/+$/, '');
    const detected = getDetectedBackendUrl();
    if (!cleaned || cleaned === detected) {
      this.baseUrl = detected;
      await AsyncStorage.removeItem('chat_api_url');
      await AsyncStorage.removeItem('chat_api_url_custom');
      return;
    }
    this.baseUrl = cleaned;
    await AsyncStorage.setItem('chat_api_url', this.baseUrl);
    await AsyncStorage.setItem('chat_api_url_custom', 'true');
  }

  async resetServerUrl() {
    const detected = getDetectedBackendUrl();
    this.baseUrl = detected;
    await AsyncStorage.removeItem('chat_api_url');
    await AsyncStorage.removeItem('chat_api_url_custom');
    return detected;
  }

  async setCredentials(username, password) {
    this.username = (username || '').trim();
    this.password = (password || '').trim();
    this.hasStoredCredentials = true;
    await AsyncStorage.setItem('chat_username', this.username);
    await AsyncStorage.setItem('chat_password', this.password);
  }

  async logout() {
    this.username = '';
    this.password = '';
    this.hasStoredCredentials = false;
    await AsyncStorage.removeItem('chat_username');
    await AsyncStorage.removeItem('chat_password');
  }

  getAuthHeader() {
    if (!this.username || !this.password) return {};
    return {
      Authorization: `Basic ${this.username}:${this.password}`,
    };
  }

  async _getLocalArchiveMap() {
    try {
      const raw = await AsyncStorage.getItem(ARCHIVE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  async _saveLocalArchiveMap(map) {
    try {
      await AsyncStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to save archive map', e);
    }
  }

  async request(endpoint, options = {}) {
    await this.init();
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
    } catch (netErr) {
      throw new Error(`Cannot reach server at ${this.baseUrl}. Check Wi-Fi / Hotspot connection.`);
    }

    if (response.status === 401) {
      throw new Error('Authentication failed: Invalid credentials');
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      const msg =
        data && data.message
          ? Array.isArray(data.message)
            ? data.message.join(', ')
            : data.message
          : `HTTP ${response.status}`;
      throw new Error(msg);
    }

    return data;
  }

  async getProfile(userId) {
    const q = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    return this.request(`/user/profile${q}`);
  }

  async getAllUsers() {
    return this.request('/user');
  }

  async getConversations() {
    return this.request('/conversation');
  }

  async createConversation({ type, name, participants_ids }) {
    return this.request('/conversation', {
      method: 'POST',
      body: JSON.stringify({ type, name, participants_ids }),
    });
  }

  /**
   * Upload a file/image using the backend's POST /file endpoint:
   * Body: { file_name, mime_type, data }
   */
  async uploadFile({ fileName, mimeType, base64Data }) {
    const res = await this.request('/file', {
      method: 'POST',
      body: JSON.stringify({
        file_name: fileName || `photo_${Date.now()}.jpg`,
        mime_type: mimeType || 'image/jpeg',
        data: base64Data,
      }),
    });

    if (res && res.id && base64Data) {
      const dataUri = base64Data.startsWith('data:')
        ? base64Data
        : `data:${res.mimeType || mimeType || 'image/jpeg'};base64,${base64Data}`;
      this.fileDataUriCache.set(res.id, dataUri);
    }

    return res;
  }

  /**
   * Fetch a file's base64 content using GET /file/{id}
   */
  async getFileDataUri(fileId) {
    if (!fileId) return null;
    if (this.fileDataUriCache.has(fileId)) {
      return this.fileDataUriCache.get(fileId);
    }

    try {
      const fileObj = await this.request(`/file/${encodeURIComponent(fileId)}`);
      if (fileObj && fileObj.data) {
        const mime = fileObj.mimeType || 'image/jpeg';
        const dataUri = fileObj.data.startsWith('data:')
          ? fileObj.data
          : `data:${mime};base64,${fileObj.data}`;
        this.fileDataUriCache.set(fileId, dataUri);
        return dataUri;
      }
    } catch (e) {
      console.warn(`Failed to load file ${fileId}:`, e.message);
    }
    return null;
  }

  async hydrateMessagesWithFiles(messages = []) {
    return Promise.all(
      messages.map(async (m) => {
        const fileId = m.fileId || m.file?.id;
        if (fileId) {
          const resolvedImageUri = await this.getFileDataUri(fileId);
          return {
            ...m,
            resolvedImageUri,
          };
        }
        if (m.imageInfo) {
          const resolvedImageUri = m.imageInfo.startsWith('data:')
            ? m.imageInfo
            : `data:image/jpeg;base64,${m.imageInfo}`;
          return {
            ...m,
            resolvedImageUri,
          };
        }
        return m;
      })
    );
  }

  async getMessages(conversationId, cursor) {
    let q = `?conversation_id=${encodeURIComponent(conversationId)}`;
    if (cursor) q += `&from_message_cursor=${encodeURIComponent(cursor)}`;
    const res = await this.request(`/message${q}`);
    const archiveMap = await this._getLocalArchiveMap();
    if (res && Array.isArray(res.data)) {
      const active = res.data.filter((m) => !archiveMap[m.id]);
      res.data = await this.hydrateMessagesWithFiles(active);
    }
    return res;
  }

  async sendMessage(conversationId, content, imageAsset = null) {
    const trimmedText = (content || '').trim();

    if (imageAsset) {
      const base64Payload = imageAsset.base64 || imageAsset.uri;
      const uploadedFile = await this.uploadFile({
        fileName: imageAsset.fileName || `photo_${Date.now()}.jpg`,
        mimeType: imageAsset.mimeType || 'image/jpeg',
        base64Data: base64Payload,
      });

      const body = {
        conversation_id: conversationId,
        file_id: uploadedFile.id,
      };
      if (trimmedText.length > 0) {
        body.content = trimmedText;
      }

      const createdMsg = await this.request('/message', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const hydrated = await this.hydrateMessagesWithFiles([createdMsg]);
      return hydrated[0];
    }

    return this.request('/message', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: conversationId,
        content: trimmedText,
      }),
    });
  }

  async getArchivedMessages(conversationId) {
    const archiveMap = await this._getLocalArchiveMap();
    let localItems = Object.values(archiveMap).filter((item) => !item.permanentlyDeleted);
    if (conversationId) {
      localItems = localItems.filter((item) => item.conversationId === conversationId);
    }

    try {
      const q = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : '';
      const serverRes = await this.request(`/message/archived${q}`);
      if (serverRes && Array.isArray(serverRes.data)) {
        const mergedMap = new Map();
        for (const item of localItems) mergedMap.set(item.id, item);
        for (const item of serverRes.data) {
          if (!archiveMap[item.id]?.permanentlyDeleted) {
            mergedMap.set(item.id, item);
          }
        }
        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.archivedAt || b.createdAt) - new Date(a.archivedAt || a.createdAt)
        );
        const hydrated = await this.hydrateMessagesWithFiles(merged);
        return { data: hydrated, count: hydrated.length };
      }
    } catch {
      // Fallback to local archive store if remote server lacks /message/archived
    }

    localItems.sort(
      (a, b) => new Date(b.archivedAt || b.createdAt) - new Date(a.archivedAt || a.createdAt)
    );
    const hydratedLocal = await this.hydrateMessagesWithFiles(localItems);
    return { data: hydratedLocal, count: hydratedLocal.length };
  }

  async deleteMessage(messageOrId) {
    const msgObj =
      typeof messageOrId === 'object' && messageOrId !== null
        ? messageOrId
        : { id: messageOrId };
    const messageId = msgObj.id;

    const archiveMap = await this._getLocalArchiveMap();
    archiveMap[messageId] = {
      ...msgObj,
      id: messageId,
      isArchived: true,
      archivedAt: new Date().toISOString(),
      permanentlyDeleted: false,
    };
    await this._saveLocalArchiveMap(archiveMap);

    try {
      await this.request(`/message/${encodeURIComponent(messageId)}`, {
        method: 'DELETE',
      });
    } catch {
      // Stored in local archive when remote server doesn't have DELETE /message/:id
    }

    return archiveMap[messageId];
  }

  async restoreMessage(messageId) {
    const archiveMap = await this._getLocalArchiveMap();
    delete archiveMap[messageId];
    await this._saveLocalArchiveMap(archiveMap);

    try {
      await this.request(`/message/${encodeURIComponent(messageId)}/restore`, {
        method: 'PATCH',
      });
    } catch {
      // Restored locally
    }

    return { id: messageId, isArchived: false };
  }

  async permanentlyDeleteMessage(messageId) {
    const archiveMap = await this._getLocalArchiveMap();
    if (archiveMap[messageId]) {
      archiveMap[messageId].permanentlyDeleted = true;
    } else {
      archiveMap[messageId] = { id: messageId, permanentlyDeleted: true };
    }
    await this._saveLocalArchiveMap(archiveMap);

    try {
      await this.request(`/message/${encodeURIComponent(messageId)}/permanent`, {
        method: 'DELETE',
      });
    } catch {
      // Permanently hidden locally
    }

    return { id: messageId, deleted: true };
  }
}

export const api = new ChatApiService();
