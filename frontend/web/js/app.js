/**
 * Main Chat Application Logic
 * Integrates store, api client, and DOM views.
 */

document.addEventListener('DOMContentLoaded', () => {
  const app = new ChatApp();
  app.init();
});

class ChatApp {
  constructor() {
    this.pollIntervalId = null;
    this.isSending = false;
    this.initialLoadDone = false;
  }

  // ─── Initialization ───────────────────────────────────────────────────────

  async init() {
    this.initIcons();
    this.initTheme();
    this.bindEvents();

    // Check credentials
    if (!window.api.hasCredentials()) {
      this.showAuthModal(true);
    } else {
      await this.authenticateAndBoot();
    }
  }

  initIcons() {
    const setIcon = (id, svg) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = svg;
    };

    setIcon('brand-icon-el', UI.icons.chatBubble);
    setIcon('plus-icon-container', UI.icons.plus);
    setIcon('search-icon-container', UI.icons.search);
    setIcon('refresh-icon-container', UI.icons.refresh);
    setIcon('info-icon-container', UI.icons.info);
    setIcon('send-icon-container', UI.icons.send);
    setIcon('empty-chat-icon', UI.icons.chatBubble);
    setIcon('close-drawer-icon', UI.icons.close);
    setIcon('copy-icon-container', UI.icons.copy);
    setIcon('auth-close-icon', UI.icons.close);
    setIcon('conv-close-icon', UI.icons.close);
  }

  initTheme() {
    const currentTheme = window.store.state.theme;
    document.documentElement.setAttribute('data-theme', currentTheme);
    this.updateThemeButtonIcon(currentTheme);
  }

  updateThemeButtonIcon(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    btn.innerHTML = theme === 'dark' ? UI.icons.sun : UI.icons.moon;
    btn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }

  // ─── Authentication & Boot ────────────────────────────────────────────────

  async authenticateAndBoot() {
    try {
      // 1. Fetch own profile
      const user = await window.api.getProfile();
      window.store.setCurrentUser(user);
      this.updateCurrentUserUI(user);

      // 2. Fetch all registered users
      const allUsers = await window.api.getAllUsers();
      window.store.setUsers(allUsers);

      // 3. Fetch conversations
      await this.refreshConversations();

      // 4. Start polling loop
      this.startPolling();

      // Close auth modal if open
      this.hideAuthModal();
      this.initialLoadDone = true;
    } catch (err) {
      console.error('Failed to authenticate:', err);
      if (err.status === 401) {
        UI.toast('Authentication failed. Check your password.', 'error');
        window.api.clearCredentials();
        this.showAuthModal(true);
      } else {
        UI.toast(`Could not connect: ${err.message}`, 'error');
        this.showAuthModal(true);
      }
    }
  }

  updateCurrentUserUI(user) {
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-display-name');
    if (avatarEl && nameEl) {
      avatarEl.textContent = UI.getInitials(user.name);
      avatarEl.style.backgroundColor = UI.getDeterministicColor(user.name);
      nameEl.textContent = user.name;
    }
  }

  // ─── Event Binding ────────────────────────────────────────────────────────

  bindEvents() {
    // Theme toggle
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
      window.store.toggleTheme();
      this.updateThemeButtonIcon(window.store.state.theme);
    });

    // Switch account / user badge
    document.getElementById('switch-account-btn').addEventListener('click', () => {
      this.showAuthModal(false);
    });
    document.getElementById('user-badge').addEventListener('click', () => {
      this.showAuthModal(false);
    });

    // Auth modal form
    document.getElementById('auth-form').addEventListener('submit', (e) => this.handleAuthSubmit(e));
    document.getElementById('close-auth-modal').addEventListener('click', () => this.hideAuthModal());
    document.getElementById('cancel-auth-btn').addEventListener('click', () => this.hideAuthModal());

    // Quick accounts picker in auth modal
    document.getElementById('quick-accounts-list').addEventListener('click', (e) => {
      const chip = e.target.closest('.account-chip');
      if (chip) {
        document.getElementById('auth-username').value = chip.dataset.user;
        document.getElementById('auth-password').value = chip.dataset.pass;
      }
    });

    // Conversation search & filter tabs
    document.getElementById('conv-search-input').addEventListener('input', (e) => {
      window.store.setSearchQuery(e.target.value);
      this.renderConversationList();
    });

    document.querySelectorAll('.filter-tab[data-filter]').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-tab[data-filter]').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        window.store.setFilter(tab.dataset.filter);
        this.renderConversationList();
      });
    });

    // New conversation modal
    const openNewConv = () => this.showNewConvModal();
    document.getElementById('new-conv-btn').addEventListener('click', openNewConv);
    document.getElementById('empty-new-chat-btn').addEventListener('click', openNewConv);
    document.getElementById('close-conv-modal').addEventListener('click', () => this.hideNewConvModal());

    // New conversation modal tabs
    document.getElementById('tab-new-dm').addEventListener('click', () => this.switchNewConvTab('DM'));
    document.getElementById('tab-new-group').addEventListener('click', () => this.switchNewConvTab('GROUP'));
    document.getElementById('cancel-group-btn').addEventListener('click', () => this.hideNewConvModal());
    document.getElementById('create-group-btn').addEventListener('click', () => this.handleCreateGroup());

    // DM user search in modal
    document.getElementById('dm-user-search').addEventListener('input', (e) => {
      this.renderDmUsersList(e.target.value);
    });

    // Refresh button
    document.getElementById('refresh-chat-btn').addEventListener('click', () => {
      this.refreshCurrentChat();
    });

    // Details drawer
    document.getElementById('toggle-drawer-btn').addEventListener('click', () => {
      window.store.toggleDetailsDrawer();
      this.updateDetailsDrawer();
    });
    document.getElementById('close-drawer-btn').addEventListener('click', () => {
      window.store.toggleDetailsDrawer();
      this.updateDetailsDrawer();
    });

    // Copy conversation ID
    document.getElementById('copy-id-btn').addEventListener('click', () => {
      const id = document.getElementById('drawer-id-val').textContent;
      if (id) {
        navigator.clipboard.writeText(id).then(() => {
          UI.toast('Conversation ID copied to clipboard', 'info');
        });
      }
    });

    // Message Form & Textarea
    const textarea = document.getElementById('message-textarea');
    const sendBtn = document.getElementById('send-btn');

    textarea.addEventListener('input', () => {
      // Auto-resize
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
      sendBtn.disabled = !textarea.value.trim();
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
          this.handleSendMessage();
        }
      }
    });

    document.getElementById('message-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSendMessage();
    });

    // Background tab visibility
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopPolling();
      } else {
        this.startPolling();
        this.refreshCurrentChat();
      }
    });
  }

  // ─── Auth Modal Handling ──────────────────────────────────────────────────

  showAuthModal(isMandatory = false) {
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('hidden');

    const closeBtn = document.getElementById('close-auth-modal');
    const cancelBtn = document.getElementById('cancel-auth-btn');

    if (isMandatory) {
      closeBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
    } else {
      closeBtn.style.display = 'inline-flex';
      cancelBtn.style.display = 'inline-flex';
    }

    // Prepopulate
    document.getElementById('auth-username').value = window.api.username || '';
    document.getElementById('auth-password').value = window.api.password || '';
    document.getElementById('api-url-input').value = window.api.baseUrl || 'http://localhost:3001';

    // Update quick accounts list from saved accounts
    this.renderQuickAccounts();
  }

  hideAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
  }

  renderQuickAccounts() {
    const container = document.getElementById('quick-accounts-list');
    const known = window.store.state.knownAccounts;
    const defaults = ['Alice', 'Bob', 'Charlie', 'Ritesh'];
    const merged = Array.from(new Set([...known, ...defaults]));

    container.innerHTML = merged.map((name) => `
      <button type="button" class="account-chip" data-user="${UI.escapeHtml(name)}" data-pass="pass123">
        ${UI.escapeHtml(name)}
      </button>
    `).join('');
  }

  async handleAuthSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const apiUrl = document.getElementById('api-url-input').value.trim();

    if (!username || !password) {
      UI.toast('Please enter both username and password', 'error');
      return;
    }

    if (apiUrl) {
      window.api.setBaseUrl(apiUrl);
    }

    window.api.setCredentials(username, password);
    const submitBtn = document.getElementById('auth-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating...';

    try {
      await this.authenticateAndBoot();
      UI.toast(`Signed in as ${username}`, 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Connect & Continue';
    }
  }

  // ─── Conversations & Polling ──────────────────────────────────────────────

  startPolling() {
    this.stopPolling();
    this.pollIntervalId = setInterval(() => this.pollCycle(), 3000);
  }

  stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  async pollCycle() {
    try {
      if (!window.api.hasCredentials()) return;
      await this.refreshConversations(true);
      if (window.store.state.activeConversationId) {
        await this.fetchMessages(window.store.state.activeConversationId, null, false, true);
      }
    } catch (err) {
      // Quiet poll error
      console.warn('Poll error:', err.message);
    }
  }

  async refreshConversations(isBackground = false) {
    const list = await window.api.getConversations();
    window.store.setConversations(list);
    this.renderConversationList();

    // Auto-select first conversation if none selected yet
    if (!window.store.state.activeConversationId && list.length > 0 && !isBackground) {
      this.selectConversation(list[0].id);
    }
  }

  renderConversationList() {
    const { conversations, activeConversationId, filter, searchQuery, usersMap, currentUser } = window.store.state;
    const container = document.getElementById('conversation-list');
    if (!container) return;

    let filtered = conversations.filter((c) => {
      if (filter === 'DM' && c.type !== 'DM') return false;
      if (filter === 'GROUP' && c.type !== 'GROUP') return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = this.getConversationDisplayName(c).toLowerCase();
        return name.includes(q);
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          ${searchQuery ? 'No matching conversations' : 'No conversations yet.<br>Click <strong>New Chat</strong> to start one.'}
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((c) => {
      const isActive = c.id === activeConversationId;
      const displayName = this.getConversationDisplayName(c);
      const initials = UI.getInitials(displayName);
      const color = UI.getDeterministicColor(displayName);
      const timeStr = UI.formatRelativeTime(c.createdAt);
      const typeLabel = c.type === 'GROUP' ? 'Group' : 'DM';

      // Check if we have recent messages cached for preview
      const convMsgs = window.store.state.messages[c.id]?.data || [];
      const lastMsg = convMsgs.length > 0 ? convMsgs[convMsgs.length - 1] : null;
      let snippet = 'No messages yet';
      if (lastMsg) {
        snippet = lastMsg.content && lastMsg.content.startsWith('data:image/')
          ? '📷 Photo'
          : UI.escapeHtml(lastMsg.content);
      }

      return `
        <li class="conversation-item ${isActive ? 'active' : ''}" data-conv-id="${c.id}">
          <div class="conversation-avatar-wrap">
            <div class="avatar" style="background-color: ${color};">${initials}</div>
          </div>
          <div class="conversation-meta">
            <div class="conversation-top-row">
              <span class="conversation-name">${UI.escapeHtml(displayName)}</span>
              <span class="conversation-time">${timeStr}</span>
            </div>
            <div class="conversation-bottom-row">
              <span class="conversation-snippet">${snippet}</span>
              <span class="type-pill">${typeLabel}</span>
            </div>
          </div>
        </li>
      `;
    }).join('');

    // Attach click listeners
    container.querySelectorAll('.conversation-item').forEach((item) => {
      item.addEventListener('click', () => {
        this.selectConversation(item.dataset.convId);
      });
    });
  }

  getConversationDisplayName(conv) {
    if (conv.name) return conv.name;

    const { currentUser, usersMap } = window.store.state;
    if (conv.type === 'DM') {
      // Find the other participant's name
      const currentId = currentUser?.id;
      const otherId = conv.participants_ids?.find((id) => id !== currentId) || conv.participants_ids?.[0];
      const otherUser = usersMap[otherId];
      return otherUser ? otherUser.name : (otherId ? `User (${otherId.slice(-4)})` : 'Direct Message');
    }

    // Group fallback
    return `Group (${conv.participants_ids?.length || 0} members)`;
  }

  // ─── Selecting & Rendering Active Conversation ────────────────────────────

  async selectConversation(convId) {
    window.store.setActiveConversation(convId);
    this.renderConversationList();

    const conv = window.store.state.conversations.find((c) => c.id === convId);
    if (!conv) return;

    // Show header & input
    document.getElementById('chat-header').style.display = 'flex';
    document.getElementById('chat-input-container').style.display = 'block';
    document.getElementById('no-chat-selected')?.remove();

    // Set header info
    const displayName = this.getConversationDisplayName(conv);
    const titleEl = document.getElementById('active-chat-title');
    const subEl = document.getElementById('active-chat-sub');
    const avatarEl = document.getElementById('active-chat-avatar');
    const badgeEl = document.getElementById('active-chat-badge');

    titleEl.textContent = displayName;
    avatarEl.textContent = UI.getInitials(displayName);
    avatarEl.style.backgroundColor = UI.getDeterministicColor(displayName);
    badgeEl.textContent = conv.type;

    if (conv.type === 'DM') {
      subEl.textContent = 'Direct message';
    } else {
      const count = conv.participants_ids?.length || 0;
      subEl.textContent = `${count} members`;
    }

    // Update details drawer
    this.updateDetailsDrawer();

    // Fetch messages
    await this.fetchMessages(convId);
  }

  async fetchMessages(convId, cursor = null, prepend = false, isBackground = false) {
    try {
      const res = await window.api.getMessages(convId, cursor);
      window.store.setConversationMessages(convId, {
        data: res.data || [],
        nextCursor: res.nextCursor,
        prepend,
      });

      this.renderMessagesStream(convId, prepend);
    } catch (err) {
      if (!isBackground) {
        UI.toast(`Failed to load messages: ${err.message}`, 'error');
      }
    }
  }

  renderMessagesStream(convId, preserveScroll = false) {
    const stream = document.getElementById('messages-stream');
    if (!stream) return;

    const convState = window.store.state.messages[convId];
    if (!convState) return;

    const { data: messages, nextCursor } = convState;
    const { currentUser, usersMap } = window.store.state;

    const prevScrollHeight = stream.scrollHeight;
    const prevScrollTop = stream.scrollTop;

    if (messages.length === 0) {
      stream.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${UI.icons.chatBubble}</div>
          <h3 class="empty-state-title">No messages yet</h3>
          <p class="empty-state-desc">Send the first message to start the conversation.</p>
        </div>
      `;
      return;
    }

    let html = '';

    // Load Older Cursor Banner
    if (nextCursor) {
      html += `
        <div class="load-older-banner">
          <button id="load-older-btn" class="btn-load-older">
            &uarr; Load earlier messages
          </button>
        </div>
      `;
    }

    let lastDateStr = null;

    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== lastDateStr) {
        lastDateStr = msgDate;
        html += `
          <div class="date-divider">
            <span class="date-divider-text">${UI.formatDateDivider(msg.createdAt)}</span>
          </div>
        `;
      }

      const isSent = msg.senderId === currentUser?.id;
      const senderUser = usersMap[msg.senderId];
      const senderName = senderUser ? senderUser.name : (isSent ? currentUser?.name : 'User');
      const timeStr = UI.formatTime(msg.createdAt);

      // Check delivery/read status
      let receiptHtml = '';
      if (isSent && msg.status) {
        // Look at other participants' read/delivered flags
        const others = Object.entries(msg.status).filter(([id]) => id !== currentUser?.id);
        const allRead = others.length > 0 && others.every(([_, st]) => st.read);
        const anyDelivered = others.some(([_, st]) => st.delivered);

        if (allRead) {
          receiptHtml = `<span class="receipt-icon" title="Read">${UI.icons.checkCheck}</span>`;
        } else if (anyDelivered) {
          receiptHtml = `<span class="receipt-icon" title="Delivered">${UI.icons.check}</span>`;
        } else {
          receiptHtml = `<span class="receipt-icon" title="Sent">${UI.icons.check}</span>`;
        }
      }

      // Format message body (support base64 image messages with optional caption)
      let bodyHtml = '';
      if (msg.content && msg.content.startsWith('data:image/')) {
        const nlIndex = msg.content.indexOf('\n');
        const imgUri = nlIndex === -1 ? msg.content : msg.content.slice(0, nlIndex);
        const caption = nlIndex === -1 ? '' : msg.content.slice(nlIndex + 1);
        bodyHtml = `<img src="${imgUri}" alt="Shared photo" style="max-width: 240px; max-height: 240px; border-radius: 6px; display: block; object-fit: cover;" />`;
        if (caption) {
          bodyHtml += `<div style="margin-top: 6px;">${UI.escapeHtml(caption)}</div>`;
        }
      } else {
        bodyHtml = UI.escapeHtml(msg.content);
      }

      if (isSent) {
        html += `
          <div class="message-row sent" data-id="${msg.id}">
            <div class="message-bubble-wrap">
              <div class="message-bubble">${bodyHtml}</div>
              <div class="message-meta">
                <span>${timeStr}</span>
                ${receiptHtml}
                <button class="delete-msg-btn" data-id="${msg.id}" title="Delete & Archive" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:11px;padding:0 4px;">Archive</button>
              </div>
            </div>
          </div>
        `;
      } else {
        const avatarColor = UI.getDeterministicColor(senderName);
        const initials = UI.getInitials(senderName);

        html += `
          <div class="message-row received" data-id="${msg.id}">
            <div class="avatar avatar-sm" style="background-color: ${avatarColor};" title="${UI.escapeHtml(senderName)}">
              ${initials}
            </div>
            <div class="message-bubble-wrap">
              <span class="message-sender-name">${UI.escapeHtml(senderName)}</span>
              <div class="message-bubble">${bodyHtml}</div>
              <div class="message-meta">
                <span>${timeStr}</span>
                <button class="delete-msg-btn" data-id="${msg.id}" title="Delete & Archive" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:11px;padding:0 4px;">Archive</button>
              </div>
            </div>
          </div>
        `;
      }
    });

    stream.innerHTML = html;

    stream.querySelectorAll('.delete-msg-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const msgId = btn.dataset.id;
        if (confirm('Delete this message and move it to Archive?')) {
          try {
            await window.api.deleteMessage(msgId);
            UI.toast('Message moved to Archive', 'info');
            await this.fetchMessages(convId);
          } catch (err) {
            UI.toast(`Could not archive: ${err.message}`, 'error');
          }
        }
      });
    });

    // Attach "Load earlier messages" click listener
    const loadOlderBtn = document.getElementById('load-older-btn');
    if (loadOlderBtn) {
      loadOlderBtn.addEventListener('click', async () => {
        loadOlderBtn.disabled = true;
        loadOlderBtn.textContent = 'Loading...';
        await this.fetchMessages(convId, nextCursor, true);
      });
    }

    // Scroll management
    if (preserveScroll) {
      // Maintain previous view position when prepending older messages
      const newScrollHeight = stream.scrollHeight;
      stream.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
    } else {
      // Auto-scroll to bottom on fresh messages
      stream.scrollTop = stream.scrollHeight;
    }
  }

  refreshCurrentChat() {
    const { activeConversationId } = window.store.state;
    if (activeConversationId) {
      this.fetchMessages(activeConversationId);
      this.refreshConversations(true);
    }
  }

  // ─── Sending Messages ─────────────────────────────────────────────────────

  async handleSendMessage() {
    const { activeConversationId, currentUser } = window.store.state;
    if (!activeConversationId || this.isSending) return;

    const textarea = document.getElementById('message-textarea');
    const sendBtn = document.getElementById('send-btn');
    const content = textarea.value.trim();
    if (!content) return;

    this.isSending = true;
    sendBtn.disabled = true;

    // Reset textarea
    textarea.value = '';
    textarea.style.height = 'auto';

    try {
      const newMsg = await window.api.sendMessage(activeConversationId, content);
      window.store.appendSentMessage(activeConversationId, newMsg);
      this.renderMessagesStream(activeConversationId);
      this.renderConversationList(); // Update snippet
    } catch (err) {
      UI.toast(`Failed to send message: ${err.message}`, 'error');
      textarea.value = content; // restore draft
      textarea.focus();
    } finally {
      this.isSending = false;
      sendBtn.disabled = !textarea.value.trim();
    }
  }

  // ─── Details Drawer ───────────────────────────────────────────────────────

  updateDetailsDrawer() {
    const drawer = document.getElementById('details-drawer');
    const isOpen = window.store.state.isDetailsDrawerOpen;

    if (!isOpen) {
      drawer.classList.add('collapsed');
      return;
    }
    drawer.classList.remove('collapsed');

    const { activeConversationId, conversations, usersMap, currentUser } = window.store.state;
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) return;

    document.getElementById('drawer-type-val').textContent = conv.type;
    document.getElementById('drawer-created-val').textContent = new Date(conv.createdAt).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    document.getElementById('drawer-id-val').textContent = conv.id;

    // Participants
    const listEl = document.getElementById('drawer-participants-list');
    const participantIds = conv.participants_ids || [];
    document.getElementById('drawer-participants-title').textContent = `Participants (${participantIds.length})`;

    listEl.innerHTML = participantIds.map((userId) => {
      const user = usersMap[userId];
      const name = user ? user.name : `User (${userId.slice(-4)})`;
      const bio = user?.bio || (userId === currentUser?.id ? 'You' : '');
      const initials = UI.getInitials(name);
      const color = UI.getDeterministicColor(name);
      const isMe = userId === currentUser?.id;

      return `
        <li class="participant-item">
          <div class="participant-info">
            <div class="avatar avatar-sm" style="background-color: ${color};">${initials}</div>
            <div style="min-width: 0;">
              <div class="participant-name">${UI.escapeHtml(name)} ${isMe ? '<span style="font-weight:400; color:var(--text-muted);">(You)</span>' : ''}</div>
              ${bio ? `<div class="participant-bio">${UI.escapeHtml(bio)}</div>` : ''}
            </div>
          </div>
          ${!isMe ? `
            <button class="btn btn-secondary btn-sm start-direct-dm-btn" data-user-id="${userId}" title="Message ${UI.escapeHtml(name)}">
              DM
            </button>
          ` : ''}
        </li>
      `;
    }).join('');

    // Attach DM buttons inside drawer
    listEl.querySelectorAll('.start-direct-dm-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetUserId = btn.dataset.userId;
        await this.startDmWithUser(targetUserId);
      });
    });
  }

  // ─── New Conversation Modal ───────────────────────────────────────────────

  showNewConvModal() {
    const modal = document.getElementById('new-conv-modal');
    modal.classList.remove('hidden');
    this.switchNewConvTab('DM');
    this.renderDmUsersList();
    this.renderGroupUsersList();
  }

  hideNewConvModal() {
    document.getElementById('new-conv-modal').classList.add('hidden');
  }

  switchNewConvTab(type) {
    const dmTab = document.getElementById('tab-new-dm');
    const groupTab = document.getElementById('tab-new-group');
    const dmPane = document.getElementById('pane-new-dm');
    const groupPane = document.getElementById('pane-new-group');
    const groupFooter = document.getElementById('group-modal-footer');

    if (type === 'DM') {
      dmTab.classList.add('active');
      groupTab.classList.remove('active');
      dmPane.style.display = 'block';
      groupPane.style.display = 'none';
      groupFooter.style.display = 'none';
    } else {
      groupTab.classList.add('active');
      dmTab.classList.remove('active');
      groupPane.style.display = 'block';
      dmPane.style.display = 'none';
      groupFooter.style.display = 'flex';
    }
  }

  renderDmUsersList(search = '') {
    const listEl = document.getElementById('dm-user-list');
    const { allUsers, currentUser } = window.store.state;

    const filtered = allUsers.filter((u) => {
      if (u.id === currentUser?.id) return false;
      if (search) {
        return u.name.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<li style="padding: 14px; text-align: center; color: var(--text-muted); font-size: 13px;">No other users found</li>`;
      return;
    }

    listEl.innerHTML = filtered.map((u) => {
      const initials = UI.getInitials(u.name);
      const color = UI.getDeterministicColor(u.name);
      return `
        <li class="modal-user-item dm-user-row" data-user-id="${u.id}">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="avatar avatar-sm" style="background-color: ${color};">${initials}</div>
            <div>
              <div style="font-weight: 600; font-size: 13px;">${UI.escapeHtml(u.name)}</div>
              ${u.bio ? `<div style="font-size: 11px; color: var(--text-muted);">${UI.escapeHtml(u.bio)}</div>` : ''}
            </div>
          </div>
          <button class="btn btn-secondary btn-sm">Chat</button>
        </li>
      `;
    }).join('');

    listEl.querySelectorAll('.dm-user-row').forEach((row) => {
      row.addEventListener('click', async () => {
        await this.startDmWithUser(row.dataset.userId);
      });
    });
  }

  renderGroupUsersList() {
    const listEl = document.getElementById('group-user-list');
    const { allUsers, currentUser } = window.store.state;

    const others = allUsers.filter((u) => u.id !== currentUser?.id);

    if (others.length === 0) {
      listEl.innerHTML = `<li style="padding: 14px; text-align: center; color: var(--text-muted); font-size: 13px;">No other users available</li>`;
      return;
    }

    listEl.innerHTML = others.map((u) => {
      const initials = UI.getInitials(u.name);
      const color = UI.getDeterministicColor(u.name);
      return `
        <li class="modal-user-item">
          <label style="display: flex; align-items: center; gap: 10px; width: 100%; cursor: pointer;">
            <input type="checkbox" class="group-user-checkbox" value="${u.id}" />
            <div class="avatar avatar-sm" style="background-color: ${color};">${initials}</div>
            <div style="flex: 1;">
              <div style="font-weight: 500; font-size: 13px;">${UI.escapeHtml(u.name)}</div>
              ${u.bio ? `<div style="font-size: 11px; color: var(--text-muted);">${UI.escapeHtml(u.bio)}</div>` : ''}
            </div>
          </label>
        </li>
      `;
    }).join('');
  }

  async startDmWithUser(targetUserId) {
    try {
      this.hideNewConvModal();
      const conv = await window.api.createConversation({
        type: 'DM',
        participants_ids: [targetUserId],
      });
      await this.refreshConversations();
      this.selectConversation(conv.id);
    } catch (err) {
      UI.toast(`Could not open DM: ${err.message}`, 'error');
    }
  }

  async handleCreateGroup() {
    const nameInput = document.getElementById('group-name-input');
    const name = nameInput.value.trim();
    const checkboxes = document.querySelectorAll('.group-user-checkbox:checked');
    const selectedIds = Array.from(checkboxes).map((cb) => cb.value);

    if (selectedIds.length === 0) {
      UI.toast('Please select at least one participant', 'error');
      return;
    }

    try {
      const createBtn = document.getElementById('create-group-btn');
      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';

      const conv = await window.api.createConversation({
        type: 'GROUP',
        name: name || undefined,
        participants_ids: selectedIds,
      });

      this.hideNewConvModal();
      nameInput.value = '';
      await this.refreshConversations();
      this.selectConversation(conv.id);
      UI.toast('Group created successfully', 'success');
    } catch (err) {
      UI.toast(`Could not create group: ${err.message}`, 'error');
    } finally {
      const createBtn = document.getElementById('create-group-btn');
      createBtn.disabled = false;
      createBtn.textContent = 'Create Group';
    }
  }
}

