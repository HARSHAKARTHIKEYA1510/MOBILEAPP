import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PALETTE, getDeterministicColor, getInitials } from '../../theme';

export default function DetailsModal({ visible, onClose, conversation, allUsers, currentUser }) {
  if (!conversation) return null;

  const participants = (conversation.participants_ids || []).map((id) => {
    const user = allUsers.find((u) => u.id === id);
    return user || { id, name: `User (${id.slice(-4)})` };
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Conversation Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={PALETTE.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>{conversation.type}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Created</Text>
              <Text style={styles.infoValue}>
                {new Date(conversation.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Conversation ID</Text>
              <Text style={[styles.infoValue, styles.mono]}>{conversation.id}</Text>
            </View>
          </View>

          <View style={[styles.section, { flex: 1 }]}>
            <Text style={styles.sectionTitle}>
              Participants ({participants.length})
            </Text>
            <FlatList
              data={participants}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isMe = item.id === currentUser?.id;
                const color = getDeterministicColor(item.name);
                const initials = getInitials(item.name);

                return (
                  <View style={styles.userRow}>
                    <View style={[styles.avatar, { backgroundColor: color }]}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>
                        {item.name} {isMe ? <Text style={styles.meTag}>(You)</Text> : null}
                      </Text>
                      {item.bio ? <Text style={styles.userBio}>{item.bio}</Text> : null}
                    </View>
                  </View>
                );
              }}
            />
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeActionBtn} onPress={onClose}>
              <Text style={styles.closeActionText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '75%',
    backgroundColor: PALETTE.bgSurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
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
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.borderSubtle,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: PALETTE.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 12.5,
    color: PALETTE.textSecondary,
  },
  infoValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  mono: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: PALETTE.bgSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  meTag: {
    color: PALETTE.textMuted,
    fontWeight: '400',
  },
  userBio: {
    fontSize: 11,
    color: PALETTE.textMuted,
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: PALETTE.borderSubtle,
    backgroundColor: PALETTE.bgSubtle,
    alignItems: 'flex-end',
  },
  closeActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: PALETTE.primary,
  },
  closeActionText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '600',
  },
});

