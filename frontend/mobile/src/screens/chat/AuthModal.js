import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getDetectedBackendUrl } from '../../services/api';
import { PALETTE } from '../../theme';

const PRESET_USERS = [
  { name: 'Varun', pass: 'varun@udata' },
  { name: 'dinesh', pass: 'pass123' },
  { name: 'Alice', pass: 'pass123' },
  { name: 'Bob', pass: 'pass123' },
  { name: 'Charlie', pass: 'pass123' },
];

export default function AuthModal({ visible, onClose, onSuccess, currentUser }) {
  const [username, setUsername] = useState(api.username || '');
  const [password, setPassword] = useState(api.password || '');
  const [serverUrl, setServerUrl] = useState(api.baseUrl || getDetectedBackendUrl());
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  React.useEffect(() => {
    if (visible) {
      api.init().then(() => {
        setUsername(api.username || '');
        setPassword(api.password || '');
        setServerUrl(api.baseUrl || getDetectedBackendUrl());
      });
    }
  }, [visible]);

  const handleConnect = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      if (serverUrl.trim()) {
        await api.setServerUrl(serverUrl.trim());
      }
      await api.setCredentials(username.trim(), password.trim());
      const profile = await api.getProfile();
      onSuccess(profile);
    } catch (err) {
      Alert.alert('Connection Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const pickPreset = (preset) => {
    setUsername(preset.name);
    setPassword(preset.pass);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>User Account</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={PALETTE.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {currentUser && (
              <View style={styles.currentProfileBanner}>
                <Ionicons name="person-circle-outline" size={20} color={PALETTE.accent} />
                <Text style={styles.currentProfileText}>
                  Signed in as <Text style={styles.bold}>{currentUser.name}</Text>
                </Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Username (Display Name)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Alice"
                placeholderTextColor={PALETTE.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password (Secret Key)</Text>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={PALETTE.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
              />
            </View>

            {/* Quick Test Users */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Quick Switch User</Text>
              <View style={styles.presetsRow}>
                {PRESET_USERS.map((p) => {
                  const isSelected = username.toLowerCase() === p.name.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={p.name}
                      style={[styles.presetChip, isSelected && styles.presetChipActive]}
                      onPress={() => pickPreset(p)}
                    >
                      <Text style={[styles.presetText, isSelected && styles.presetTextActive]}>
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Server URL configuration */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text style={styles.toggleText}>Advanced: Backend Server URL</Text>
              <Ionicons
                name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={PALETTE.textSecondary}
              />
            </TouchableOpacity>

            {showAdvanced && (
              <View style={styles.formGroup}>
                <TextInput
                  style={[styles.input, styles.monoInput]}
                  placeholder={getDetectedBackendUrl()}
                  placeholderTextColor={PALETTE.textMuted}
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setServerUrl(getDetectedBackendUrl())}
                  style={{ alignSelf: 'flex-start', paddingVertical: 4 }}
                >
                  <Text style={{ fontSize: 11.5, color: PALETTE.accent, fontWeight: '600' }}>
                    Reset to Local Server ({getDetectedBackendUrl()})
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.connectBtn} onPress={handleConnect} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.connectBtnText}>Save &amp; Connect</Text>
              )}
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
    backgroundColor: 'rgba(15, 23, 42, 0.55)', // Solid opaque backdrop, zero glassmorphism
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
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
  body: {
    padding: 16,
    gap: 12,
  },
  currentProfileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    padding: 8,
    borderRadius: 6,
  },
  currentProfileText: {
    fontSize: 12,
    color: PALETTE.textSecondary,
  },
  bold: {
    fontWeight: '700',
    color: PALETTE.textPrimary,
  },
  formGroup: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.textSecondary,
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
  monoInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
  },
  presetChipActive: {
    backgroundColor: PALETTE.primary,
    borderColor: PALETTE.primary,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  presetTextActive: {
    color: '#FFFFFF',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 12,
    color: PALETTE.textSecondary,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: PALETTE.borderSubtle,
    backgroundColor: PALETTE.bgSubtle,
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    backgroundColor: PALETTE.bgSurface,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  connectBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: PALETTE.primary,
  },
  connectBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

