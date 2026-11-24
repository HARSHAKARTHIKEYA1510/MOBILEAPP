import { prisma } from './db.mjs';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function registerPushToken(userId, body) {
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const platform = typeof body?.platform === 'string' ? body.platform.trim() : null;

  if (!token) {
    const err = new Error('Push token is required');
    err.status = 400;
    throw err;
  }

  await prisma.pushToken.upsert({
    where: { token },
    update: { userId, platform },
    create: { token, userId, platform },
  });

  return { ok: true };
}

export async function unregisterPushToken(userId, body) {
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) return { ok: true };

  await prisma.pushToken.deleteMany({
    where: { token, userId },
  });

  return { ok: true };
}

export async function notifyConversationParticipants({ conversationId, senderName, recipientIds, message }) {
  if (!recipientIds || recipientIds.length === 0) return;

  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: recipientIds } },
    select: { token: true },
  });

  if (tokens.length === 0) return;

  const pushMessages = tokens.map(({ token }) => ({
    to: token,
    sound: 'default',
    title: senderName || 'Nova',
    body: message.type === 'IMAGE' ? '📷 Sent a photo' : message.content || 'Sent an attachment',
    data: {
      conversationId,
      messageId: message.id,
      title: senderName,
    },
  }));

  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pushMessages),
    });
  } catch (err) {
    console.error('[push] Push notification failed:', err?.message || err);
  }
}
