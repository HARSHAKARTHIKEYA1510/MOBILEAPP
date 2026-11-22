/**
 * Chat Application State Store
 * Centralized state with pub/sub event subscription.
 */

class StateStore {
  constructor() {
    this.state = {
      currentUser: null,
      allUsers: [],
      usersMap: {},
      conversations: [],
      activeConversationId: null,
      messages: {}, // conversationId -> { data: [], nextCursor: null, loadingOlder: false }
      filter: 'ALL', // 'ALL' | 'DM' | 'GROUP'
      searchQuery: '',
      theme: localStorage.getItem('chat_theme') || 'light',
      isDetailsDrawerOpen: false,
      isPolling: true,
      lastPolledAt: null,
      knownAccounts: JSON.parse(localStorage.getItem('chat_saved_accounts') || '[]'),
    };

    this.subscribers = new Set();
  }

  getState() {
    return this.state;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify(changedKeys = []) {
    for (const callback of this.subscribers) {
      try {
        callback(this.state, changedKeys);
      } catch (err) {
        console.error('State subscriber error:', err);
      }
    }
  }

  setState(updates) {
    let changed = [];
    for (const [key, val] of Object.entries(updates)) {
      if (this.state[key] !== val) {
        this.state[key] = val;
        changed.push(key);
      }
    }
    if (changed.length > 0) {
      this.notify(changed);
    }
  }

  // Helper actions
  setCurrentUser(user) {
    this.setState({ currentUser: user });
    if (user && user.name) {
      this.saveKnownAccount(user.name);
    }
  }

  saveKnownAccount(username) {
    if (!username) return;
    const existing = new Set(this.state.knownAccounts);
    existing.add(username);
    const updated = Array.from(existing);
    this.setState({ knownAccounts: updated });
    localStorage.setItem('chat_saved_accounts', JSON.stringify(updated));
  }

  setUsers(users) {
    const map = {};
    for (const u of users) {
      map[u.id] = u;
    }
    this.setState({ allUsers: users, usersMap: map });
  }

  setConversations(conversations) {
    this.setState({ conversations });
  }

  setActiveConversation(id) {
    this.setState({ activeConversationId: id });
  }

  setConversationMessages(conversationId, { data, nextCursor, prepend = false }) {
    const current = this.state.messages[conversationId] || { data: [], nextCursor: null };
    let newMessages;

    if (prepend) {
      // Prepending older messages (avoiding duplicate IDs)
      const existingIds = new Set(current.data.map(m => m.id));
      const filtered = data.filter(m => !existingIds.has(m.id));
      newMessages = [...filtered, ...current.data];
    } else {
      // Setting fresh or merging new messages
      const map = new Map();
      // Keep existing
      for (const m of current.data) {
        map.set(m.id, m);
      }
      // Add or replace with newer data
      for (const m of data) {
        map.set(m.id, m);
      }
      newMessages = Array.from(map.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }

    this.state.messages = {
      ...this.state.messages,
      [conversationId]: {
        data: newMessages,
        nextCursor: nextCursor !== undefined ? nextCursor : current.nextCursor,
        loadingOlder: false,
      },
    };

    this.notify(['messages']);
  }

  appendSentMessage(conversationId, message) {
    const current = this.state.messages[conversationId] || { data: [], nextCursor: null };
    const exists = current.data.some(m => m.id === message.id);
    if (!exists) {
      this.state.messages = {
        ...this.state.messages,
        [conversationId]: {
          ...current,
          data: [...current.data, message],
        },
      };
      this.notify(['messages']);
    }
  }

  setFilter(filter) {
    this.setState({ filter });
  }

  setSearchQuery(searchQuery) {
    this.setState({ searchQuery });
  }

  setTheme(theme) {
    localStorage.setItem('chat_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.setState({ theme });
  }

  toggleTheme() {
    const next = this.state.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }

  toggleDetailsDrawer() {
    this.setState({ isDetailsDrawerOpen: !this.state.isDetailsDrawerOpen });
  }
}

window.store = new StateStore();

