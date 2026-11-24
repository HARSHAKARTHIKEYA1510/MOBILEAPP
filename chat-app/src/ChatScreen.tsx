import { Ionicons } from '@expo/vector-icons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { Message, getFile, getMessages, sendMessage, uploadFile } from './api';
import { colors, formatDayLabel, formatTime, isSameDay } from './theme';

const POLL_MS = 3000;
const MAX_IMAGE_WIDTH = 1280;
const IMAGE_CACHE_LIMIT = 50;

type Props = { conversationId: string; title: string; meId: string; onBack: () => void };
type PendingImage = { uri: string; base64: string; name: string };

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return diff !== 0 ? diff : b.id.localeCompare(a.id);
  });
}

function Ticks({ m, meId }: { m: Message; meId: string }) {
  const others = Object.entries(m.status ?? {}).filter(([id]) => id !== meId);
  const read = others.length > 0 && others.every(([, s]) => s.read);
  const delivered = others.length > 0 && others.every(([, s]) => s.delivered || s.read);
  return (
    <Ionicons
      name={delivered ? 'checkmark-done' : 'checkmark'}
      size={14}
      color={read ? colors.tickRead : colors.tickSent}
    />
  );
}

const imageCache = new Map<string, string>();
const imageRequests = new Map<string, Promise<string>>();

function loadImage(fileId: string): Promise<string> {
  const cached = imageCache.get(fileId);
  if (cached) return Promise.resolve(cached);
  let req = imageRequests.get(fileId);
  if (!req) {
    req = getFile(fileId)
      .then((f) => {
        const dataUri = `data:${f.mimeType || 'image/jpeg'};base64,${f.data}`;
        imageCache.set(fileId, dataUri);
        if (imageCache.size > IMAGE_CACHE_LIMIT) {
          const oldest = imageCache.keys().next().value;
          if (oldest !== undefined) imageCache.delete(oldest);
        }
        return dataUri;
      })
      .finally(() => imageRequests.delete(fileId));
    imageRequests.set(fileId, req);
  }
  return req;
}

function ChatImage({
  fileId,
  mine,
  onOpenViewer,
}: {
  fileId: string;
  mine: boolean;
  onOpenViewer: (uri: string) => void;
}) {
  const [uri, setUri] = useState(() => imageCache.get(fileId) ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    setUri(imageCache.get(fileId) ?? '');
    loadImage(fileId)
      .then((u) => active && setUri(u))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : 'Unknown error'));
    return () => {
      active = false;
    };
  }, [fileId]);

  if (error) {
    return (
      <View style={styles.imgErrorBox}>
        <Ionicons name="alert-circle-outline" size={16} color={mine ? colors.outgoingText : colors.error} />
        <Text style={[styles.imgErrorText, mine && styles.outText]}>Image unavailable</Text>
      </View>
    );
  }
  if (!uri) {
    return (
      <View style={[styles.msgImage, styles.msgImageLoading]}>
        <ActivityIndicator color={mine ? '#FFFFFF' : colors.brand} />
      </View>
    );
  }
  return (
    <Pressable onPress={() => onOpenViewer(uri)}>
      <Image source={{ uri }} style={styles.msgImage} resizeMode="cover" />
    </Pressable>
  );
}

export function ChatScreen({ conversationId, title, meId, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [image, setImage] = useState<PendingImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const cursor = useRef<string | null>(null);
  const reachedStart = useRef(false);
  const loadingOlder = useRef(false);
  const polling = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const page = await getMessages(conversationId);
      if (!mounted.current) return;
      setMessages((prev) => mergeMessages(prev, page.data));
      if (!cursor.current && !reachedStart.current) cursor.current = page.nextCursor ?? null;
    } catch {
      // transient network poll
    } finally {
      polling.current = false;
      if (mounted.current) setInitialLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const loadOlder = async () => {
    if (!cursor.current || loadingOlder.current) return;
    loadingOlder.current = true;
    try {
      const page = await getMessages(conversationId, cursor.current);
      if (!mounted.current) return;
      setMessages((prev) => mergeMessages(prev, page.data));
      cursor.current = page.nextCursor ?? null;
      if (!cursor.current) reachedStart.current = true;
    } catch {
      // retry on next scroll threshold
    } finally {
      loadingOlder.current = false;
    }
  };

  const pickImage = async () => {
    if (preparing || sending) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        if (perm.canAskAgain) {
          Alert.alert('Permission needed', 'Photo access is needed to attach images.');
        } else {
          Alert.alert('Photo access blocked', 'Enable photo access for Nova in Settings to attach images.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      setPreparing(true);
      const ctx = ImageManipulator.manipulate(asset.uri);
      if (asset.width > MAX_IMAGE_WIDTH) ctx.resize({ width: MAX_IMAGE_WIDTH });
      const rendered = await ctx.renderAsync();
      const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
      if (!out.base64) throw new Error('Image could not be encoded');
      if (mounted.current) setImage({ uri: out.uri, base64: out.base64, name: `photo-${Date.now()}.jpg` });
    } catch {
      if (mounted.current) Alert.alert('Upload error', 'Could not prepare that image. Please try again.');
    } finally {
      if (mounted.current) setPreparing(false);
    }
  };

  const send = async () => {
    const content = text.trim();
    if ((!content && !image) || sending) return;
    const pending = image;
    setSending(true);
    setText('');
    setImage(null);
    try {
      const file = pending ? await uploadFile(pending.name, 'image/jpeg', pending.base64) : null;
      const m = await sendMessage(conversationId, content, file?.id);
      if (mounted.current) setMessages((prev) => mergeMessages(prev, [m]));
    } catch (e: unknown) {
      if (!mounted.current) return;
      setText(content);
      setImage(pending);
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      if (mounted.current) setSending(false);
    }
  };

  const canSend = (!!text.trim() || !!image) && !sending && !preparing;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Dynamic Nova Chat Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={onBack}
          hitSlop={8}
          accessibilityLabel="Back to chats">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Avatar name={title} size={42} showOnline={true} />
        <View style={styles.headerTextWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.subtitle}>Active on Nova</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.secureBadge}>
            <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={
            initialLoading ? (
              <View style={styles.emptyCenter}>
                <ActivityIndicator color={colors.brand} size="large" />
              </View>
            ) : (
              <View style={styles.emptyCenter}>
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconBubble}>
                    <Ionicons name="sparkles" size={22} color={colors.brand} />
                  </View>
                  <Text style={styles.emptyTitle}>Chat with {title}</Text>
                  <Text style={styles.emptySub}>
                    Direct messages are synchronized in real-time across your workspace.
                  </Text>
                </View>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const mine = item.senderId === meId;
            const older = messages[index + 1];
            const newer = messages[index - 1];
            const showDateHeader = !older || !isSameDay(item.createdAt, older.createdAt);
            const groupedWithNewer =
              !!newer && newer.senderId === item.senderId && isSameDay(item.createdAt, newer.createdAt);
            const imageId = item.fileId ?? item.file?.id;

            return (
              <View>
                {showDateHeader && (
                  <View style={styles.dateRow}>
                    <View style={styles.datePill}>
                      <Text style={styles.dateText}>{formatDayLabel(item.createdAt)}</Text>
                    </View>
                  </View>
                )}
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.out : styles.in,
                    groupedWithNewer ? styles.bubbleGrouped : styles.bubbleTailGap,
                  ]}>
                  {item.type === 'IMAGE' &&
                    (imageId ? (
                      <ChatImage fileId={imageId} mine={mine} onOpenViewer={setViewerUri} />
                    ) : (
                      <View style={styles.fileRow}>
                        <Ionicons name="image" size={16} color={mine ? '#FFFFFF' : colors.text} />
                        <Text style={[styles.msg, mine && styles.outText]}>Photo</Text>
                      </View>
                    ))}
                  {item.type === 'FILE' && (
                    <View style={styles.fileRow}>
                      <Ionicons name="document-text" size={16} color={mine ? '#FFFFFF' : colors.text} />
                      <Text style={[styles.msg, mine && styles.outText]}>
                        {item.file?.name ?? 'Attachment'}
                      </Text>
                    </View>
                  )}
                  {!!item.content && <Text style={[styles.msg, mine && styles.outText]}>{item.content}</Text>}
                  <View style={styles.meta}>
                    <Text style={[styles.time, mine && styles.outTime]}>{formatTime(item.createdAt)}</Text>
                    {mine && <Ticks m={item} meId={meId} />}
                  </View>
                </View>
              </View>
            );
          }}
        />

        {/* Selected Image Preview Pill */}
        {(image || preparing) && (
          <View style={styles.preview}>
            {image ? (
              <Image source={{ uri: image.uri }} style={styles.previewImg} />
            ) : (
              <View style={[styles.previewImg, styles.previewLoading]}>
                <ActivityIndicator color={colors.brand} />
              </View>
            )}
            <View style={styles.previewInfo}>
              <Text style={styles.previewTitle}>{image ? 'Photo ready' : 'Optimizing photo…'}</Text>
              <Text style={styles.previewSub}>{image ? 'Add a message or send now' : 'Compressing for rapid upload'}</Text>
            </View>
            {image && !sending && (
              <Pressable style={styles.previewRemoveBtn} onPress={() => setImage(null)} hitSlop={8}>
                <Ionicons name="close" size={18} color={colors.subtext} />
              </Pressable>
            )}
          </View>
        )}

        {/* Modern Floating Composer */}
        <View style={styles.composerBar}>
          <Pressable
            onPress={pickImage}
            hitSlop={6}
            style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
            disabled={preparing || sending}
            accessibilityLabel="Attach photo">
            <Ionicons name="image-outline" size={20} color={colors.brand} />
          </Pressable>
          <Pressable
            style={styles.inputBox}
            onPress={() => inputRef.current?.focus()}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={image ? 'Add a caption…' : 'Type a message…'}
              placeholderTextColor={colors.muted}
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="center"
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.send,
              !canSend && styles.sendDisabled,
              pressed && canSend && styles.sendPressed,
            ]}
            onPress={send}
            disabled={!canSend}
            accessibilityLabel="Send message">
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={19} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen Photo Viewer */}
      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerBackdrop}>
          <SafeAreaView style={styles.viewerSafe}>
            <View style={styles.viewerTopBar}>
              <Pressable style={styles.viewerCloseBtn} onPress={() => setViewerUri(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
            {viewerUri && <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    shadowColor: colors.brand,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: colors.border,
  },
  headerTextWrap: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.online,
  },
  subtitle: { color: colors.subtext, fontSize: 12, fontWeight: '500' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secureBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, backgroundColor: colors.chatBg },
  list: { paddingHorizontal: 14, paddingVertical: 12 },
  emptyList: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  emptyCenter: { alignItems: 'center', justifyContent: 'center' },
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 20,
    alignItems: 'center',
    maxWidth: 290,
    shadowColor: colors.brand,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  emptyIconBubble: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: colors.subtext, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  dateRow: { alignItems: 'center', marginVertical: 14 },
  datePill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  dateText: { fontSize: 11, fontWeight: '600', color: colors.subtext },
  bubble: {
    maxWidth: '78%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: colors.brand,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  bubbleGrouped: { marginVertical: 2 },
  bubbleTailGap: { marginTop: 2, marginBottom: 8 },
  out: {
    alignSelf: 'flex-end',
    backgroundColor: colors.outgoing,
    borderBottomRightRadius: 5,
  },
  in: {
    alignSelf: 'flex-start',
    backgroundColor: colors.incoming,
    borderWidth: 1,
    borderColor: colors.incomingBorder,
    borderBottomLeftRadius: 5,
  },
  msgImage: { width: 230, height: 230, borderRadius: 14, marginBottom: 6 },
  msgImageLoading: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  imgErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  imgErrorText: { fontSize: 14, color: colors.error },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  msg: { fontSize: 15, lineHeight: 21, color: colors.text },
  outText: { color: colors.outgoingText },
  meta: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4 },
  time: { fontSize: 11, color: colors.muted },
  outTime: { color: colors.outgoingSubtext },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 16,
    shadowColor: colors.brand,
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  previewImg: { width: 48, height: 48, borderRadius: 10 },
  previewLoading: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  previewInfo: { flex: 1 },
  previewTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  previewSub: { fontSize: 12, color: colors.subtext, marginTop: 2 },
  previewRemoveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachBtnPressed: { backgroundColor: colors.border },
  inputBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    minHeight: 42,
    justifyContent: 'center',
  },
  input: {
    fontSize: 16,
    lineHeight: 20,
    color: colors.text,
    maxHeight: 110,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  sendPressed: { backgroundColor: colors.accentPressed },
  sendDisabled: { backgroundColor: colors.muted, opacity: 0.4 },
  viewerBackdrop: { flex: 1, backgroundColor: '#060814' },
  viewerSafe: { flex: 1 },
  viewerTopBar: { alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 12 },
  viewerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { flex: 1, width: '100%' },
});
