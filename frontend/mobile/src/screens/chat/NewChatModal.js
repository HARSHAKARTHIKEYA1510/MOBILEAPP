import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { PALETTE, getDeterministicColor, getInitials } from '../../theme';

export default function NewChatModal({ visible, onClose, onCreated, allUsers, currentUser }) {
  const [tab, setTab] = useState('DM'); // 'DM' | 'GROUP'
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [freshUsers, setFreshUsers] = useState([]);

  React.useEffect(() => {
    if (visible) {
      api.getAllUsers().then((list) => {
        if (Array.isArray(list)) setFreshUsers(list);
      }).catch(() => {});
    }
  }, [visible]);

  const usersPool = freshUsers.length > 0 ? freshUsers : allUsers;
  const availableUsers = usersPool.filter((u) => u.id !== currentUser?.id);

  const filteredUsers = availableUsers.filter((u) => {
    if (!search.trim()) return true;
    return u.name.toLowerCase().includes(search.toLowerCase());
  });

  const toggleUserSelection = (userId) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const startDm = async (targetUser) => {
    setLoading(true);
    try {
      const conv = await api.createConversation({
        type: 'DM',
        participants_ids: [targetUser.id],
      });
      onCreated(conv, targetUser.name);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async () => {
    if (selectedUserIds.length === 0) {
      Alert.alert('Required', 'Please select at least one participant.');
      return;
    }

    setLoading(true);
    try {
      const conv = await api.createConversation({
        type: 'GROUP',
        name: groupName.trim() || undefined,
        participants_ids: selectedUserIds,
      });
      onCreated(conv);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>New Conversation</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={PALETTE.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Tab Filter */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'DM' && styles.tabBtnActive]}
              onPress={() => setTab('DM')}
            >
              <Text style={[styles.tabText, tab === 'DM' && styles.tabTextActive]}>
                Direct Message
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'GROUP' && styles.tabBtnActive]}
              onPress={() => setTab('GROUP')}
            >
              <Text style={[styles.tabText, tab === 'GROUP' && styles.tabTextActive]}>
                Group Chat
              </Text>
            </TouchableOpacity>
          </View>

          {tab === 'GROUP' && (
            <View style={styles.groupNameBox}>
              <TextInput
                style={styles.input}
                placeholder="Group Name (e.g. Mobile Dev Team)"
                placeholderTextColor={PALETTE.textMuted}
                value={groupName}
                onChangeText={setGroupName}
              />
            </View>
          )}

          {/* User Search */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={PALETTE.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search users..."
              placeholderTextColor={PALETTE.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>

          {/* Users List */}
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            style={styles.userList}
            renderItem={({ item }) => {
              const isSelected = selectedUserIds.includes(item.id);
              const color = getDeterministicColor(item.name);
              const initials = getInitials(item.name);

              return (
                <TouchableOpacity
                  style={[styles.userRow, isSelected && styles.userRowSelected]}
                  onPress={() => (tab === 'DM' ? startDm(item) : toggleUserSelection(item.id))}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatar, { backgroundColor: color }]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>

                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.name}</Text>
                    {item.bio ? <Text style={styles.userBio}>{item.bio}</Text> : null}
                  </View>

                  {tab === 'DM' ? (
                    <View style={styles.chatActionBtn}>
                      <Text style={styles.chatActionText}>Chat</Text>
                    </View>
                  ) : (
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isSelected ? PALETTE.accent : PALETTE.textMuted}
                    />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No matching users found</Text>
              </View>
            }
          />

          {tab === 'GROUP' && (
            <View style={styles.footer}>
              <Text style={styles.footerInfo}>
                {selectedUserIds.length} participant{selectedUserIds.length === 1 ? '' : 's'} selected
              </Text>
              <TouchableOpacity
                style={[styles.createGroupBtn, selectedUserIds.length === 0 && styles.btnDisabled]}
                disabled={selectedUserIds.length === 0 || loading}
                onPress={createGroup}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.createGroupText}>Create Group</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: PALETTE.bgSurface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '75%',
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.borderSubtle,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  tabsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: PALETTE.bgSubtle,
    borderRadius: 6,
    padding: 2,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 5,
  },
  tabBtnActive: {
    backgroundColor: PALETTE.bgSurface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: PALETTE.textSecondary,
  },
  tabTextActive: {
    fontWeight: '700',
    color: PALETTE.textPrimary,
  },
  groupNameBox: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  input: {
    height: 38,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    color: PALETTE.textPrimary,
    backgroundColor: PALETTE.bgSurface,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    borderRadius: 6,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 10,
    height: 36,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: PALETTE.textPrimary,
    padding: 0,
  },
  userList: {
    flex: 1,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.borderSubtle,
    gap: 12,
  },
  userRowSelected: {
    backgroundColor: PALETTE.bgSubtle,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  userBio: {
    fontSize: 11,
    color: PALETTE.textMuted,
    marginTop: 1,
  },
  chatActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
  },
  chatActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: PALETTE.borderSubtle,
    backgroundColor: PALETTE.bgSubtle,
  },
  footerInfo: {
    fontSize: 12,
    color: PALETTE.textSecondary,
    fontWeight: '500',
  },
  createGroupBtn: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  createGroupText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12.5,
    color: PALETTE.textMuted,
  },
});

