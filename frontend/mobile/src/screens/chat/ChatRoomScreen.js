import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../../services/api';
import { PALETTE, getDeterministicColor, getInitials, formatTime } from '../../theme';
import DetailsModal from './DetailsModal';
import ArchivedMessagesModal from './ArchivedMessagesModal';

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

export default function ChatRoomScreen({ route, navigation }) {
  const { conversation, title } = route.params;
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [permissionPromptConfirmed, setPermissionPromptConfirmed] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);

  const flatListRef = useRef(null);
  const pollTimerRef = useRef(null);

  const loadData = useCallback(async (isQuiet = false) => {
    try {
      if (!isQuiet) setLoading(true);
      const [profile, users, res, archivedRes] = await Promise.all([
        api.getProfile().catch(() => null),
        api.getAllUsers().catch(() => []),
        api.getMessages(conversation.id).catch(() => ({ data: [] })),
        api.getArchivedMessages(conversation.id).catch(() => ({ data: [], count: 0 })),
      ]);

      if (profile) setCurrentUser(profile);
      if (users) setAllUsers(users);
      if (res && res.data) {
        setMessages(res.data);
      }
      if (archivedRes) {
        setArchivedCount(archivedRes.count ?? (archivedRes.data?.length || 0));
      }
    } catch (e) {
      console.warn('Error loading messages:', e.message);
    } finally {
      setLoading(false);
    }
  }, [conversation.id]);

  useEffect(() => {
    loadData();

    pollTimerRef.current = setInterval(() => {
      loadData(true);
    }, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [loadData]);

  const openLibraryPicker = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Photo library permission is required to select and send images.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.45,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mimeType = asset.mimeType || 'image/jpeg';
        const dataUri = asset.base64
          ? `data:${mimeType};base64,${asset.base64}`
          : asset.uri;

        setSelectedImage({
          uri: dataUri,
          base64: dataUri,
          fileName: asset.fileName || `photo_${Date.now()}.jpg`,
          mimeType,
          width: asset.width,
          height: asset.height,
        });
      }
    } catch (err) {
      Alert.alert('Image Error', `Could not load image: ${err.message}`);
    }
  };

  const openCameraPicker = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Camera permission is required to take and send photos.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.45,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mimeType = asset.mimeType || 'image/jpeg';
        const dataUri = asset.base64
          ? `data:${mimeType};base64,${asset.base64}`
          : asset.uri;

        setSelectedImage({
          uri: dataUri,
          base64: dataUri,
          fileName: asset.fileName || `photo_${Date.now()}.jpg`,
          mimeType,
          width: asset.width,
          height: asset.height,
        });
      }
    } catch (err) {
      Alert.alert('Camera Error', `Could not capture photo: ${err.message}`);
    }
  };

  const showImageSourceOptions = () => {
    Alert.alert(
      'Select Image',
      'Choose how you would like to attach an image',
      [
        {
          text: 'Photo Library',
          onPress: openLibraryPicker,
        },
        {
          text: 'Take Photo (Camera)',
          onPress: openCameraPicker,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleImageButtonPress = () => {
    if (!permissionPromptConfirmed) {
      Alert.alert(
        'Allow Access to Photos & Media',
        '"Workspace Chat" would like permission to access your photos and camera so you can load and send images in conversations.',
        [
          {
            text: "Don't Allow",
            style: 'cancel',
          },
          {
            text: 'Allow',
            onPress: () => {
              setPermissionPromptConfirmed(true);
              showImageSourceOptions();
            },
          },
        ]
      );
    } else {
      showImageSourceOptions();
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && !selectedImage) || sending) return;

    const imageToSend = selectedImage;

    setInputText('');
    setSelectedImage(null);
    setSending(true);

    try {
      const newMsg = await api.sendMessage(conversation.id, text, imageToSend);
      setMessages((prev) => [...prev, newMsg]);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      Alert.alert('Send Failed', err.message);
      setInputText(text);
      if (imageToSend) setSelectedImage(imageToSend);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = (msg) => {
    Alert.alert(
      'Delete Message',
      'Delete this message? It will be removed from the conversation and moved to Archive.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete & Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteMessage(msg);
              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
              setArchivedCount((c) => c + 1);
            } catch (err) {
              Alert.alert('Delete Failed', err.message);
            }
          },
        },
      ]
    );
  };

  const renderMessage = ({ item }) => {
    const isSent = item.senderId === currentUser?.id;
    const sender = allUsers.find((u) => u.id === item.senderId);
    const senderName = sender ? sender.name : isSent ? currentUser?.name : 'User';
    const timeStr = formatTime(item.createdAt);
    const { imageUri, text } = parseMessageItem(item);

    let isRead = false;
    let isDelivered = false;
    if (isSent && item.status) {
      const others = Object.entries(item.status).filter(([id]) => id !== currentUser?.id);
      isRead = others.length > 0 && others.every(([_, st]) => st.read);
      isDelivered = others.some(([_, st]) => st.delivered);
    }

    return (
      <View style={[styles.msgRow, isSent ? styles.msgRowSent : styles.msgRowReceived]}>
        {!isSent && (
          <View style={[styles.msgAvatar, { backgroundColor: getDeterministicColor(senderName) }]}>
            <Text style={styles.msgAvatarText}>{getInitials(senderName)}</Text>
          </View>
        )}

        <View style={styles.bubbleWrapper}>
          {!isSent && conversation.type === 'GROUP' && (
            <Text style={styles.senderLabel}>{senderName}</Text>
          )}

          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={() => handleDeleteMessage(item)}
            delayLongPress={300}
            style={[
              styles.msgBubble,
              isSent ? styles.bubbleSent : styles.bubbleReceived,
              imageUri && styles.msgBubbleWithImage,
            ]}
          >
            {imageUri && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setPreviewImageUri(imageUri)}
                onLongPress={() => handleDeleteMessage(item)}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={styles.msgImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}

            {Boolean(text) && (
              <Text
                style={[
                  styles.msgText,
                  isSent ? styles.msgTextSent : styles.msgTextReceived,
                  imageUri && styles.msgCaptionSpacing,
                ]}
              >
                {text}
              </Text>
            )}

            <View style={styles.metaRow}>
              <Text style={[styles.timeText, isSent ? styles.timeTextSent : styles.timeTextReceived]}>
                {timeStr}
              </Text>
              {isSent && (
                <Ionicons
                  name={isRead ? 'checkmark-done' : isDelivered ? 'checkmark-done-outline' : 'checkmark'}
                  size={14}
                  color={isRead ? '#38BDF8' : PALETTE.messageSentMeta}
                  style={styles.receiptIcon}
                />
              )}
              <TouchableOpacity
                style={styles.msgDeleteBtn}
                onPress={() => handleDeleteMessage(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="trash-outline"
                  size={12}
                  color={isSent ? PALETTE.messageSentMeta : PALETTE.messageReceivedMeta}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const canSend = (Boolean(inputText.trim()) || Boolean(selectedImage)) && !sending;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={PALETTE.textPrimary} />
        </TouchableOpacity>

        <View style={[styles.headerAvatar, { backgroundColor: getDeterministicColor(title) }]}>
          <Text style={styles.headerAvatarText}>{getInitials(title)}</Text>
        </View>

        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.headerSub}>
            {conversation.type === 'GROUP'
              ? `${conversation.participants_ids?.length || 0} participants`
              : 'Direct message'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.archiveHeaderBtn}
          onPress={() => setShowArchive(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="archive-outline" size={20} color={PALETTE.textPrimary} />
          {archivedCount > 0 && (
            <View style={styles.archiveBadge}>
              <Text style={styles.archiveBadgeText}>{archivedCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => setShowDetails(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="information-circle-outline" size={22} color={PALETTE.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="small" color={PALETTE.primary} />
          <Text style={styles.loadingText}>Loading chat history...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbox-outline" size={36} color={PALETTE.textMuted} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>Send a message or photo to start the conversation!</Text>
            </View>
          }
        />
      )}

      {/* Composer Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Selected Image Preview Strip */}
        {selectedImage && (
          <View style={styles.attachmentPreviewBar}>
            <View style={styles.previewThumbWrap}>
              <Image source={{ uri: selectedImage.uri }} style={styles.previewThumb} />
              <TouchableOpacity
                style={styles.removePreviewBtn}
                onPress={() => setSelectedImage(null)}
              >
                <Ionicons name="close" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.previewTextWrap}>
              <Text style={styles.previewTitle}>Image ready to send</Text>
              <Text style={styles.previewSubtitle}>Add an optional caption below or tap Send</Text>
            </View>
          </View>
        )}

        <View style={styles.composerBar}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={handleImageButtonPress}
            activeOpacity={0.7}
          >
            <Ionicons name="image-outline" size={22} color={PALETTE.textPrimary} />
          </TouchableOpacity>

          <TextInput
            style={styles.composerInput}
            placeholder={selectedImage ? 'Add a caption...' : 'Type a message...'}
            placeholderTextColor={PALETTE.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />

          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            disabled={!canSend}
            onPress={handleSend}
            activeOpacity={0.7}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={16} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen Image Lightbox Modal */}
      <Modal
        visible={Boolean(previewImageUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <View style={styles.lightboxBackdrop}>
          <TouchableOpacity
            style={styles.lightboxCloseBtn}
            onPress={() => setPreviewImageUri(null)}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {previewImageUri && (
            <Image
              source={{ uri: previewImageUri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <DetailsModal
        visible={showDetails}
        conversation={conversation}
        allUsers={allUsers}
        currentUser={currentUser}
        onClose={() => setShowDetails(false)}
      />

      <ArchivedMessagesModal
        visible={showArchive}
        onClose={() => setShowArchive(false)}
        conversationId={conversation.id}
        conversationTitle={title}
        allUsers={allUsers}
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
  header: {
    height: 54,
    backgroundColor: PALETTE.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  backBtn: {
    padding: 6,
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.textPrimary,
  },
  headerSub: {
    fontSize: 11,
    color: PALETTE.textSecondary,
  },
  infoBtn: {
    padding: 6,
  },
  archiveHeaderBtn: {
    padding: 6,
    position: 'relative',
  },
  archiveBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  archiveBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  msgDeleteBtn: {
    marginLeft: 6,
    padding: 2,
  },
  messagesList: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },
  msgRow: {
    flexDirection: 'row',
    gap: 8,
    maxWidth: '82%',
  },
  msgRowSent: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  msgRowReceived: {
    alignSelf: 'flex-start',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  msgAvatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  bubbleWrapper: {
    gap: 2,
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: PALETTE.textSecondary,
    marginLeft: 4,
  },
  msgBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  msgBubbleWithImage: {
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
  },
  bubbleSent: {
    backgroundColor: PALETTE.messageSentBg,
    borderBottomRightRadius: 2,
  },
  bubbleReceived: {
    backgroundColor: PALETTE.messageReceivedBg,
    borderWidth: 1,
    borderColor: PALETTE.messageReceivedBorder,
    borderBottomLeftRadius: 2,
  },
  msgImage: {
    width: 220,
    height: 180,
    borderRadius: 6,
    backgroundColor: PALETTE.bgSubtle,
  },
  msgCaptionSpacing: {
    marginTop: 6,
    paddingHorizontal: 6,
  },
  msgText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  msgTextSent: {
    color: PALETTE.messageSentText,
  },
  msgTextReceived: {
    color: PALETTE.messageReceivedText,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 3,
    paddingHorizontal: 4,
  },
  timeText: {
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  timeTextSent: {
    color: PALETTE.messageSentMeta,
  },
  timeTextReceived: {
    color: PALETTE.messageReceivedMeta,
  },
  receiptIcon: {
    marginLeft: 2,
  },
  attachmentPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.bgSurface,
    borderTopWidth: 1,
    borderTopColor: PALETTE.borderSubtle,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  previewThumbWrap: {
    position: 'relative',
  },
  previewThumb: {
    width: 54,
    height: 54,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    backgroundColor: PALETTE.bgSubtle,
  },
  removePreviewBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTextWrap: {
    flex: 1,
    gap: 2,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.textPrimary,
  },
  previewSubtitle: {
    fontSize: 11.5,
    color: PALETTE.textSecondary,
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: PALETTE.bgSurface,
    borderTopWidth: 1,
    borderTopColor: PALETTE.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    backgroundColor: PALETTE.bgSubtle,
    borderWidth: 1,
    borderColor: PALETTE.borderSubtle,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 13.5,
    color: PALETTE.textPrimary,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: PALETTE.primary,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.textPrimary,
    marginTop: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: PALETTE.textSecondary,
  },
});
