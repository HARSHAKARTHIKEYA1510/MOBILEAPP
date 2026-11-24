import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { Conversation, Message, User, createConversation, getConversations, getMessages, getUsers } from './api';
import { colors, formatListTime } from './theme';

const POLL_MS = 5000;

type Props = {
  me: User;
  onOpen: (conversation: Conversation, title: string) => void;
  onLogout: () => void;
};

type FilterTab = 'all' | 'direct' | 'groups';

export function conversationTitle(c: Conversation, meId: string, users: Record<string, User>) {
  if (c.type === 'GROUP') return c.name || 'Group';
  const other = c.participants_ids.find((id) => id !== meId);
  return (other && users[other]?.name) || c.name || 'Chat';
}

function previewText(m: Message | undefined, meId: string) {
  if (!m) return 'No messages yet';
  const prefix = m.senderId === meId ? 'You: ' : '';
  if (m.type === 'IMAGE') return `${prefix}${m.content ? `📷 Photo · ${m.content}` : '📷 Photo'}`;
  if (m.type === 'FILE') return `${prefix}📎 ${m.file?.name ?? 'Attachment'}`;
  return prefix + m.content;
}

function PreviewStatusIcon({ m, meId }: { m: Message; meId: string }) {
  if (m.senderId !== meId) return null;
  const others = Object.entries(m.status ?? {}).filter(([id]) => id !== meId);
  const read = others.length > 0 && others.every(([, s]) => s.read);
  const delivered = others.length > 0 && others.every(([, s]) => s.delivered || s.read);
  return (
    <Ionicons
      name={delivered ? 'checkmark-done' : 'checkmark'}
      size={15}
      color={read ? colors.brand : colors.muted}
      style={styles.previewTick}
    />
  );
}

export function ChatListScreen({ me, onOpen, onLogout }: Props) {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [last, setLast] = useState<Record<string, Message | undefined>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [picking, setPicking] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const searchInputRef = useRef<TextInputInstance>(null);
  const contactInputRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [cs, us] = await Promise.all([getConversations(), getUsers()]);
      const pages = await Promise.all(cs.map((c) => getMessages(c.id).catch(() => null)));
      if (!mounted.current) return;
      setUsers(Object.fromEntries(us.map((u) => [u.id, u])));
      setConvos(cs);
      setLast(Object.fromEntries(cs.map((c, i) => [c.id, pages[i]?.data.at(-1)])));
      setError('');
    } catch (e: unknown) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : 'Could not load chats');
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    if (mounted.current) setRefreshing(false);
  };

  const confirmLogout = () => {
    Alert.alert('Sign out of Nova', `Are you sure you want to sign out from @${me.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onLogout },
    ]);
  };

  const sorted = useMemo(() => {
    const activity = (c: Conversation) => new Date(last[c.id]?.createdAt ?? c.createdAt).getTime() || 0;
    let list = [...convos].sort((a, b) => activity(b) - activity(a));

    if (activeTab === 'direct') {
      list = list.filter((c) => c.type !== 'GROUP');
    } else if (activeTab === 'groups') {
      list = list.filter((c) => c.type === 'GROUP');
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const title = conversationTitle(c, me.id, users).toLowerCase();
      const body = last[c.id]?.content?.toLowerCase() ?? '';
      return title.includes(q) || body.includes(q);
    });
  }, [convos, last, search, activeTab, me.id, users]);

  const contacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    return Object.values(users)
      .filter((u) => u.id !== me.id)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || (u.bio?.toLowerCase().includes(q) ?? false))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, me.id, contactQuery]);

  const openPicker = () => {
    setContactQuery('');
    setPicking(true);
  };

  const startChat = async (u: User) => {
    if (starting) return;
    const existing = convos.find(
      (c) => c.type === 'DM' && c.participants_ids.includes(u.id) && c.participants_ids.every((id) => id === u.id || id === me.id),
    );
    if (existing) {
      setPicking(false);
      onOpen(existing, u.name);
      return;
    }
    setStarting(u.id);
    try {
      const c = await createConversation([u.id]);
      if (!mounted.current) return;
      setConvos((prev) => (prev.some((p) => p.id === c.id) ? prev : [c, ...prev]));
      setPicking(false);
      onOpen(c, u.name);
    } catch (e: unknown) {
      Alert.alert('Could not start conversation', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      if (mounted.current) setStarting(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <View style={styles.brandBadge}>
            <Ionicons name="sparkles" size={17} color="#FFFFFF" />
          </View>
          <View>
            <View style={styles.brandTitleRow}>
              <Text style={styles.headerTitle}>Nova</Text>
              <View style={styles.onlineDot} />
            </View>
            <Text style={styles.headerSubtitle}>Messages</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.userChip, pressed && styles.userChipPressed]}
            onPress={confirmLogout}
            accessibilityLabel="User profile and sign out">
            <Avatar name={me.name} size={28} />
            <Text style={styles.userNameText} numberOfLines={1}>
              {me.name}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.subtext} />
          </Pressable>
        </View>
      </View>

      {/* Modern Search Bar */}
      <View style={styles.searchSection}>
        <Pressable style={styles.searchBar} onPress={() => searchInputRef.current?.focus()}>
          <Ionicons name="search" size={17} color={colors.brand} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search chats and contacts…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {!!search && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.subtext} />
            </Pressable>
          )}
        </Pressable>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        <Pressable
          style={[styles.tabChip, activeTab === 'all' && styles.tabChipActive]}
          onPress={() => setActiveTab('all')}>
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>All Chats</Text>
        </Pressable>
        <Pressable
          style={[styles.tabChip, activeTab === 'direct' && styles.tabChipActive]}
          onPress={() => setActiveTab('direct')}>
          <Text style={[styles.tabText, activeTab === 'direct' && styles.tabTextActive]}>Direct</Text>
        </Pressable>
        <Pressable
          style={[styles.tabChip, activeTab === 'groups' && styles.tabChipActive]}
          onPress={() => setActiveTab('groups')}>
          <Text style={[styles.tabText, activeTab === 'groups' && styles.tabTextActive]}>Groups</Text>
        </Pressable>
      </View>

      {!!error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={17} color={colors.error} />
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          <Pressable onPress={load} hitSlop={8}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Conversation List */}
      <FlatList
        data={sorted}
        keyExtractor={(c) => c.id}
        contentContainerStyle={sorted.length === 0 ? styles.emptyListContent : styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons
                  name={search.trim() ? 'search-outline' : 'sparkles-outline'}
                  size={32}
                  color={colors.brand}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {search.trim() ? 'No matching conversations' : 'Welcome to Nova'}
              </Text>
              <Text style={styles.emptySub}>
                {search.trim()
                  ? 'Try searching with a different username or message snippet.'
                  : 'Start your first lightning-fast chat with your contacts.'}
              </Text>
              {!search.trim() && (
                <Pressable
                  style={({ pressed }) => [styles.emptyCta, pressed && styles.emptyCtaPressed]}
                  onPress={openPicker}>
                  <Ionicons name="add" size={19} color="#FFFFFF" />
                  <Text style={styles.emptyCtaText}>Start new chat</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.brand} size="large" />
            </View>
          )
        }
        renderItem={({ item }) => {
          const title = conversationTitle(item, me.id, users);
          const m = last[item.id];
          const timestamp = m ? formatListTime(m.createdAt) : formatListTime(item.createdAt);
          return (
            <Pressable
              style={({ pressed }) => [styles.cardRow, pressed && styles.cardRowPressed]}
              onPress={() => onOpen(item, title)}>
              <Avatar name={title} size={50} showOnline={true} />
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <Text style={styles.name} numberOfLines={1}>{title}</Text>
                  {!!timestamp && (
                    <View style={styles.timeBadge}>
                      <Text style={styles.timeText}>{timestamp}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.previewRow}>
                  {m && <PreviewStatusIcon m={m} meId={me.id} />}
                  <Text style={styles.preview} numberOfLines={1}>{previewText(m, me.id)}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      {/* Floating Action Button */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={openPicker}
        accessibilityLabel="Start new chat">
        <Ionicons name="chatbubble-ellipses" size={24} color="#FFFFFF" />
      </Pressable>

      {/* New Conversation Modal */}
      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>New Conversation</Text>
              <Text style={styles.modalSubtitle}>Connect with contacts on Nova</Text>
            </View>
            <Pressable onPress={() => setPicking(false)} hitSlop={8} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.searchSection}>
            <Pressable style={styles.searchBar} onPress={() => contactInputRef.current?.focus()}>
              <Ionicons name="search" size={17} color={colors.brand} />
              <TextInput
                ref={contactInputRef}
                style={styles.searchInput}
                placeholder="Search username or status…"
                placeholderTextColor={colors.muted}
                value={contactQuery}
                onChangeText={setContactQuery}
                autoCapitalize="none"
              />
              {!!contactQuery && (
                <Pressable onPress={() => setContactQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.subtext} />
                </Pressable>
              )}
            </Pressable>
          </View>
          <FlatList
            data={contacts}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={contacts.length === 0 ? styles.emptyListContent : styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="people" size={28} color={colors.brand} />
                </View>
                <Text style={styles.emptyTitle}>
                  {contactQuery.trim() ? 'No users found' : 'No other contacts yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {contactQuery.trim()
                    ? 'Check the handle spelling and search again.'
                    : 'When teammates register on Nova, they will show up here.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.contactRow, pressed && styles.cardRowPressed]}
                onPress={() => startChat(item)}
                disabled={!!starting}>
                <Avatar name={item.name} size={46} showOnline={true} />
                <View style={styles.cardBody}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.bio || 'Available on Nova'}
                  </Text>
                </View>
                {starting === item.id ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <View style={styles.chatStartIcon}>
                    <Ionicons name="arrow-forward" size={16} color={colors.brand} />
                  </View>
                )}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.online,
  },
  headerSubtitle: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '500',
    marginTop: -2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    maxWidth: 160,
  },
  userChipPressed: {
    backgroundColor: colors.border,
  },
  userNameText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 80,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  tabChipActive: {
    backgroundColor: colors.brandMuted,
    borderWidth: 1,
    borderColor: colors.brandMutedBorder,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.subtext,
  },
  tabTextActive: {
    color: colors.brand,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: 12,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: 13,
  },
  retryText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    paddingBottom: 96,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  loadingState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    color: colors.subtext,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 20,
    shadowColor: colors.brand,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  emptyCtaPressed: {
    backgroundColor: colors.accentPressed,
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.brand,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardRowPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.99 }],
  },
  cardBody: {
    flex: 1,
    marginLeft: 13,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  timeBadge: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timeText: {
    fontSize: 11,
    color: colors.subtext,
    fontWeight: '600',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  previewTick: {
    marginRight: 4,
  },
  preview: {
    flex: 1,
    fontSize: 13,
    color: colors.subtext,
    lineHeight: 18,
  },
  chatStartIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOpacity: 0.38,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabPressed: {
    backgroundColor: colors.accentPressed,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
