import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { PALETTE, getDeterministicColor, getInitials, formatRelative } from '../../theme';
import AuthModal from './AuthModal';
import NewChatModal from './NewChatModal';
import ArchivedMessagesModal from './ArchivedMessagesModal';

export default function ConversationsScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'DM' | 'GROUP'
  const [showAuth, setShowAuth] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);

  const pollTimerRef = useRef(null);

  const loadData = useCallback(async (isQuiet = false) => {
    try {
      if (!isQuiet) setLoading(true);
      await api.init();
      if (!api.hasStoredCredentials && !isQuiet) {
        setShowAuth(true);
      }
      const [profile, users, convs, archivedRes] = await Promise.all([
        api.getProfile().catch(() => null),
        api.getAllUsers().catch(() => []),
        api.getConversations().catch(() => []),
        api.getArchivedMessages().catch(() => ({ data: [], count: 0 })),
      ]);

      if (profile) setCurrentUser(profile);
      if (users) setAllUsers(users);
      if (convs) setConversations(convs);
      if (archivedRes) {
        setArchivedCount(archivedRes.count ?? (archivedRes.data?.length || 0));
      }
    } catch (err) {
      console.warn('Failed to load conversations:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Polling every 3.5s for live message updates
    pollTimerRef.current = setInterval(() => {
      loadData(true);
    }, 3500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getConvTitle = (conv) => {
    if (conv.name) return conv.name;
    if (conv.type === 'DM') {
      const otherId = conv.participants_ids?.find((id) => id !== currentUser?.id) || conv.participants_ids?.[0];
      const otherUser = allUsers.find((u) => u.id === otherId);
      return otherUser ? otherUser.name : 'Direct Message';
    }
    return `Group (${conv.participants_ids?.length || 0} members)`;
  };

  const filteredConversations = conversations.filter((c) => {
    if (filter === 'DM' && c.type !== 'DM') return false;
    if (filter === 'GROUP' && c.type !== 'GROUP') return false;
    if (search.trim()) {
      const title = getConvTitle(c).toLowerCase();
      return title.includes(search.toLowerCase());
    }
    return true;
  });

  const renderItem = ({ item }) => {
    const title = getConvTitle(item);
    const color = getDeterministicColor(title);
    const initials = getInitials(title);
    const time = formatRelative(item.createdAt);

    return (
      <TouchableOpacity
        style={styles.convCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ChatRoom', { conversation: item, title })}
      >
        <View style={[styles.avatar, { backgroundColor: color }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.convContent}>
          <View style={styles.convHeaderRow}>
            <Text style={styles.convTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.convTime}>{time}</Text>
          </View>

          <View style={styles.convFooterRow}>
            <Text style={styles.convSnippet} numberOfLines={1}>
              {item.type === 'GROUP' ? 'Group conversation' : 'Direct message'}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.type}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={PALETTE.bgSurface} />

      {/* App Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="chatbubbles" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.brandText}>Workspace Chat</Text>
            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.statusText}>Live &bull; REST API</Text>
            </View>
          </View>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.userChip}
            onPress={() => setShowAuth(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.userChipAvatar, { backgroundColor: getDeterministicColor(currentUser?.name) }]}>
              <Text style={styles.userChipAvatarText}>{getInitials(currentUser?.name || 'A')}</Text>
            </View>
            <Text style={styles.userChipName} numberOfLines={1}>
              {currentUser?.name || api.username || 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.archiveTopBtn}
            onPress={() => setShowArchive(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="archive-outline" size={18} color={PALETTE.textPrimary} />
            {archivedCount > 0 && (
              <View style={styles.archiveCountBadge}>
                <Text style={styles.archiveCountText}>{archivedCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => setShowNewChat(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={PALETTE.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={PALETTE.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={PALETTE.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Segment Pills */}
        <View style={styles.filterRow}>
          {['ALL', 'DM', 'GROUP'].map((type) => {
            const labels = { ALL: 'All', DM: 'Direct', GROUP: 'Groups' };
            const isActive = filter === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => setFilter(type)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {labels[type]}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.filterPill}
            onPress={() => setShowArchive(true)}
          >
            <Text style={styles.filterText}>
              Archive{archivedCount > 0 ? ` (${archivedCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Conversations Stream */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="small" color={PALETTE.primary} />
          <Text style={styles.loadingText}>Syncing conversations...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={32} color={PALETTE.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap the &quot;+&quot; button above to start a direct message or group chat.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => setShowNewChat(true)}
              >
                <Text style={styles.emptyBtnText}>Start New Chat</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Modals */}
      <AuthModal
        visible={showAuth}
        currentUser={currentUser}
        onClose={() => setShowAuth(false)}
        onSuccess={() => {
          setShowAuth(false);
          loadData();
        }}
      />

      <NewChatModal
        visible={showNewChat}
        allUsers={allUsers}
        currentUser={currentUser}
        onClose={() => setShowNewChat(false)}
        onCreated={(conv, targetTitle) => {
          setShowNewChat(false);
          loadData();
          navigation.navigate('ChatRoom', {
            conversation: conv,
            title: targetTitle || getConvTitle(conv),
          });
        }}
      />

      <ArchivedMessagesModal
        visible={showArchive}
        onClose={() => setShowArchive(false)}
        allUsers={allUsers}
        conversations={conversations}
        currentUser={currentUser}
        onRestored={() => loadData(true)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: PALETTE.bgCanvas,
  },
  topBar: {
    backgroundColor: PALETTE.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.textPrimary,
    letterSpacing: -0.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PALETTE.statusOnline,
  },
  statusText: {
    fontSize: 11,
    color: PALETTE.textSecondary,
    fontWeight: '500',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  userChipAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userChipAvatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  userChipName: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.textPrimary,
    maxWidth: 90,
  },
  newChatBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveTopBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  archiveCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  archiveCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  searchSection: {
    backgroundColor: PALETTE.bgSurface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.borderSubtle,
    gap: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: PALETTE.textPrimary,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: PALETTE.bgSubtle,
    borderRadius: 8,
    padding: 2,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterPillActive: {
    backgroundColor: PALETTE.bgSurface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
    color: PALETTE.textSecondary,
  },
  filterTextActive: {
    fontWeight: '700',
    color: PALETTE.textPrimary,
  },
  listContainer: {
    paddingVertical: 8,
  },
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.bgSurface,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.borderSubtle,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  convContent: {
    flex: 1,
    gap: 4,
  },
  convHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  convTime: {
    fontSize: 11,
    color: PALETTE.textMuted,
    fontVariant: ['tabular-nums'],
  },
  convFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convSnippet: {
    fontSize: 12,
    color: PALETTE.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: PALETTE.textSecondary,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: PALETTE.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    gap: 8,
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: PALETTE.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: PALETTE.primary,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

