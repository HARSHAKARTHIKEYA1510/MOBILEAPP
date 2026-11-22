import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { PALETTE, getDeterministicColor, getInitials, formatTime, formatRelative } from '../../theme';

function parseMessageItem(item) {
  if (!item) return { imageUri: null, text: '' };
  const rawContent = typeof item.content === 'string' ? item.content : '';

  if (item.resolvedImageUri) {
    return {
      imageUri: item.resolvedImageUri,
      text: rawContent.startsWith('data:image/') ? '' : rawContent,
    };
  }

  if (!rawContent) {
    return { imageUri: null, text: '' };
  }

  const firstLineEnd = rawContent.indexOf('\n');
  const firstLine = firstLineEnd !== -1 ? rawContent.slice(0, firstLineEnd) : rawContent;
  const restText = firstLineEnd !== -1 ? rawContent.slice(firstLineEnd + 1) : '';

  if (
    firstLine.startsWith('data:image/') ||
    /^https?:\/\/[^\s]+\/uploads\/img_[^\s]+\.(jpg|jpeg|png)$/i.test(firstLine)
  ) {
    return { imageUri: firstLine, text: restText };
  }
  return { imageUri: null, text: rawContent };
}

export default function ArchivedMessagesModal({
  visible,
  onClose,
  conversationId,
  conversationTitle,
  allUsers = [],
  conversations = [],
  currentUser,
  onRestored,
}) {
  const [archivedMessages, setArchivedMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);

  const loadArchived = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getArchivedMessages(conversationId);
      setArchivedMessages(res?.data || []);
    } catch (err) {
      console.warn('Could not load archived messages:', err.message);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (visible) {
      loadArchived();
    }
  }, [visible, loadArchived]);

  const handleRestore = async (msg) => {
    setActionId(msg.id);
    try {
      await api.restoreMessage(msg.id);
      setArchivedMessages((prev) => prev.filter((m) => m.id !== msg.id));
      if (onRestored) onRestored(msg);
    } catch (err) {
      Alert.alert('Restore Failed', err.message);
    } finally {
      setActionId(null);
    }
  };

  const handlePermanentDelete = (msg) => {
    Alert.alert(
      'Delete Permanently',
      'Are you sure you want to permanently remove this message from Archive? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            setActionId(msg.id);
            try {
              await api.permanentlyDeleteMessage(msg.id);
              setArchivedMessages((prev) => prev.filter((m) => m.id !== msg.id));
              if (onRestored) onRestored(msg);
            } catch (err) {
              Alert.alert('Delete Failed', err.message);
            } finally {
              setActionId(null);
            }
          },
        },
      ]
    );
  };

  const getConversationLabel = (convId) => {
    if (conversationTitle) return conversationTitle;
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return 'Chat';
    if (conv.name) return conv.name;
    if (conv.type === 'DM') {
      const otherId =
        conv.participants_ids?.find((id) => id !== currentUser?.id) ||
        conv.participants_ids?.[0];
      const otherUser = allUsers.find((u) => u.id === otherId);
      return otherUser ? otherUser.name : 'Direct Message';
    }
    return `Group (${conv.participants_ids?.length || 0})`;
  };

  const renderItem = ({ item }) => {
    const sender = allUsers.find((u) => u.id === item.senderId);
    const senderName = sender
      ? sender.name
      : item.senderId === currentUser?.id
      ? currentUser?.name || 'You'
      : 'User';
    const { imageUri, text } = parseMessageItem(item);
    const archivedTime = formatRelative(item.archivedAt || item.createdAt);
    const sentTime = formatTime(item.createdAt);
    const convLabel = getConversationLabel(item.conversationId);
    const isBusy = actionId === item.id;

    return (
      <View style={styles.archiveCard}>
        <View style={styles.cardHeader}>
          <View style={styles.senderRow}>
            <View
              style={[
                styles.smallAvatar,
                { backgroundColor: getDeterministicColor(senderName) },
              ]}
            >
              <Text style={styles.smallAvatarText}>{getInitials(senderName)}</Text>
            </View>
            <View>
              <Text style={styles.senderName}>
                {senderName}
                {item.senderId === currentUser?.id ? ' (You)' : ''}
              </Text>
              <Text style={styles.timeMeta}>
                Sent {sentTime} &bull; Archived {archivedTime}
              </Text>
            </View>
          </View>

          <View style={styles.convPill}>
            <Ionicons name="archive-outline" size={11} color={PALETTE.textSecondary} />
            <Text style={styles.convPillText} numberOfLines={1}>
              {convLabel}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={styles.archivedImage}
              resizeMode="cover"
            />
          )}
          {Boolean(text) && <Text style={styles.archivedText}>{text}</Text>}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.restoreBtn}
            onPress={() => handleRestore(item)}
            disabled={isBusy}
            activeOpacity={0.7}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={PALETTE.textPrimary} />
            ) : (
              <>
                <Ionicons
                  name="arrow-undo-outline"
                  size={14}
                  color={PALETTE.textPrimary}
                />
                <Text style={styles.restoreBtnText}>Restore to Chat</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.permanentDeleteBtn}
            onPress={() => handlePermanentDelete(item)}
            disabled={isBusy}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={14} color={PALETTE.danger} />
            <Text style={styles.permanentDeleteText}>Delete Forever</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.archiveIconBox}>
                <Ionicons name="archive" size={16} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Archived Messages</Text>
                <Text style={styles.headerSub}>
                  {conversationTitle
                    ? `Deleted messages in ${conversationTitle}`
                    : 'All deleted messages across conversations'}
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={PALETTE.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={PALETTE.primary} />
              <Text style={styles.loadingText}>Loading archived messages...</Text>
            </View>
          ) : (
            <FlatList
              data={archivedMessages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons
                      name="archive-outline"
                      size={28}
                      color={PALETTE.textSecondary}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>Archive is empty</Text>
                  <Text style={styles.emptySub}>
                    When you delete a message in chat, it will safely appear here so you can review or restore it anytime.
                  </Text>
                </View>
              }
            />
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
  sheet: {
    backgroundColor: PALETTE.bgCanvas,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    height: '80%',
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: PALETTE.bgSurface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  archiveIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.textPrimary,
  },
  headerSub: {
    fontSize: 11.5,
    color: PALETTE.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    padding: 14,
    gap: 12,
  },
  archiveCard: {
    backgroundColor: PALETTE.bgSurface,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallAvatar: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  timeMeta: {
    fontSize: 10.5,
    color: PALETTE.textMuted,
  },
  convPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 130,
  },
  convPillText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: PALETTE.textSecondary,
  },
  cardBody: {
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    borderRadius: 6,
    padding: 10,
    gap: 6,
  },
  archivedImage: {
    width: 180,
    height: 140,
    borderRadius: 6,
    backgroundColor: PALETTE.bgSurface,
  },
  archivedText: {
    fontSize: 13,
    color: PALETTE.textPrimary,
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: PALETTE.borderSubtle,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  restoreBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  permanentDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: PALETTE.bgSurface,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  permanentDeleteText: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.danger,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: PALETTE.textSecondary,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
    gap: 8,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: PALETTE.bgSurface,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.textPrimary,
  },
  emptySub: {
    fontSize: 12.5,
    color: PALETTE.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});

