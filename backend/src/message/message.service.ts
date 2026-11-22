import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/message.dto';
import { colorizeName } from '../common/color.util';

const PAGE_SIZE = 20;

@Injectable()
export class MessageService {
  private readonly logger = new Logger('Chat');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attaches file metadata (`file` + `downloadUrl`) cleanly for messages with `fileId`.
   */
  private async attachFileMetadata(messages: any[]) {
    const fileIds = Array.from(
      new Set(messages.map((m) => m.fileId).filter((id): id is string => Boolean(id))),
    );

    const fileMap = new Map<string, any>();
    if (fileIds.length > 0) {
      const files = await this.prisma.file.findMany({
        where: { id: { in: fileIds } },
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
          kind: true,
          uploadedBy: true,
          createdAt: true,
        },
      });
      for (const f of files) {
        fileMap.set(f.id, {
          ...f,
          downloadUrl: `/file/${f.id}/download`,
        });
      }
    }

    return messages.map((m) => {
      const file = m.fileId ? fileMap.get(m.fileId) ?? null : null;
      return {
        ...m,
        content: m.content ?? '',
        type: m.type ?? (file ? file.kind : 'TEXT'),
        fileId: m.fileId ?? null,
        file,
      };
    });
  }

  /**
   * Fetch messages for a conversation using cursor-based pagination.
   * - No cursor  → 20 most-recent messages.
   * - With cursor → 20 messages older than the cursor message.
   * Returned oldest-first within the page (natural chat order).
   */
  async getMessages(conversationId: string, fromMessageCursor?: string) {
    const query: any = {
      where: {
        conversationId,
        OR: [{ isArchived: false }, { isArchived: { isSet: false } }],
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        content: true,
        type: true,
        fileId: true,
        createdAt: true,
        senderId: true,
        conversationId: true,
        status: true,
        isArchived: true,
        archivedAt: true,
        archivedBy: true,
      },
    };

    if (fromMessageCursor) {
      const cursorMessage = await this.prisma.message.findUnique({
        where: { id: fromMessageCursor },
      });
      if (!cursorMessage) {
        throw new NotFoundException(`Cursor message '${fromMessageCursor}' not found`);
      }
      query.cursor = { id: fromMessageCursor };
      query.skip = 1;
    }

    const messages = await this.prisma.message.findMany(query);
    const sorted = [...messages].reverse();
    const enriched = await this.attachFileMetadata(sorted);

    return {
      data: enriched,
      nextCursor: messages.length === PAGE_SIZE ? messages[messages.length - 1].id : null,
      count: enriched.length,
    };
  }

  /**
   * Create a new message (text and/or uploaded file).
   */
  async createMessage(dto: CreateMessageDto, senderId: string) {
    const textContent = (dto.content ?? '').trim();
    if (!textContent && !dto.file_id) {
      throw new BadRequestException('Message must include content or file_id');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversation_id },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation '${dto.conversation_id}' not found`);
    }

    let attachedFile: { id: string; kind: string; uploadedBy: string; name: string } | null = null;
    if (dto.file_id) {
      attachedFile = await this.prisma.file.findUnique({
        where: { id: dto.file_id },
        select: { id: true, kind: true, uploadedBy: true, name: true },
      });
      if (!attachedFile) {
        throw new NotFoundException(`File '${dto.file_id}' not found`);
      }
      if (attachedFile.uploadedBy !== senderId) {
        throw new ForbiddenException('You can only attach files that you uploaded');
      }
    }

    // Fetch participant names explicitly — Prisma MongoDB relation joins are unreliable
    const participants = await this.prisma.user.findMany({
      where: { id: { in: conversation.participants_ids } },
      select: { id: true, name: true },
    });

    const defaultStatus: Record<string, { delivered: boolean; read: boolean }> = {};
    for (const participantId of conversation.participants_ids) {
      defaultStatus[participantId] =
        participantId === senderId
          ? { delivered: true, read: true }
          : { delivered: false, read: false };
    }

    const messageType = attachedFile ? attachedFile.kind : 'TEXT';

    const message = await this.prisma.message.create({
      data: {
        content: textContent,
        type: messageType,
        fileId: attachedFile ? attachedFile.id : null,
        senderId,
        conversationId: dto.conversation_id,
        status: defaultStatus,
        isArchived: false,
      },
    });

    const [enriched] = await this.attachFileMetadata([message]);

    // ─── Interactive Console Logging ──────────────────────────────────────────
    const isDm = conversation.type === 'DM';
    const senderUser =
      participants.find((u) => u.id === senderId) ??
      (await this.prisma.user.findUnique({ where: { id: senderId }, select: { id: true, name: true } }));

    const senderName = senderUser?.name ?? `id:${senderId}`;
    const resolvedSenderId = senderUser?.id ?? senderId;
    const receiverUsers = participants.filter((u) => u.id !== resolvedSenderId);

    const convLabel = isDm
      ? `DM [${participants.map((u) => colorizeName(u.name)).join(', ')}]`
      : conversation.name
        ? `Group "${conversation.name}"`
        : `Group [${participants.map((u) => colorizeName(u.name)).join(', ')}]`;

    const coloredSender = colorizeName(senderName);
    const coloredReceivers =
      receiverUsers.length > 0
        ? receiverUsers.map((u) => colorizeName(u.name)).join(', ')
        : 'None';

    let logContent = textContent;
    if (attachedFile) {
      const tag = `[${attachedFile.kind}: ${attachedFile.name}]`;
      logContent = textContent ? `${tag} ${textContent}` : tag;
    } else if (textContent.startsWith('data:image/')) {
      const newlineIdx = textContent.indexOf('\n');
      logContent = newlineIdx !== -1 ? `[Image] ${textContent.slice(newlineIdx + 1)}` : '[Image]';
    }

    this.logger.log(
      `\x1b[36m[MSG]\x1b[0m \x1b[1m${convLabel}\x1b[0m │ ${coloredSender} \x1b[33m➔\x1b[0m ${coloredReceivers} │ "\x1b[37m${logContent}\x1b[0m"`,
    );

    return enriched;
  }

  /**
   * Soft-deletes a message by moving it to the Archive.
   */
  async archiveMessage(messageId: string, userId: string) {
    const existing = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!existing) {
      throw new NotFoundException(`Message '${messageId}' not found`);
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: userId,
      },
    });

    this.logger.log(
      `\x1b[33m[ARCHIVE]\x1b[0m Message \x1b[1m${messageId}\x1b[0m moved to archive by user \x1b[36m${userId}\x1b[0m`,
    );

    const [enriched] = await this.attachFileMetadata([updated]);
    return enriched;
  }

  /**
   * Restores an archived message back into its conversation.
   */
  async restoreMessage(messageId: string, userId: string) {
    const existing = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!existing) {
      throw new NotFoundException(`Message '${messageId}' not found`);
    }

    const restored = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
      },
    });

    this.logger.log(
      `\x1b[32m[RESTORE]\x1b[0m Message \x1b[1m${messageId}\x1b[0m restored from archive by user \x1b[36m${userId}\x1b[0m`,
    );

    const [enriched] = await this.attachFileMetadata([restored]);
    return enriched;
  }

  /**
   * Permanently deletes a message from the database.
   */
  async permanentlyDeleteMessage(messageId: string, userId: string) {
    const existing = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!existing) {
      throw new NotFoundException(`Message '${messageId}' not found`);
    }

    await this.prisma.message.delete({
      where: { id: messageId },
    });

    this.logger.log(
      `\x1b[31m[DELETE]\x1b[0m Message \x1b[1m${messageId}\x1b[0m permanently deleted by user \x1b[36m${userId}\x1b[0m`,
    );

    return { id: messageId, deleted: true };
  }

  /**
   * Returns archived (deleted) messages for the user's conversations,
   * optionally filtered by a specific conversationId.
   */
  async getArchivedMessages(userId: string, conversationId?: string) {
    let targetConversationIds: string[] = [];

    if (conversationId) {
      targetConversationIds = [conversationId];
    } else {
      const userConversations = await this.prisma.conversation.findMany({
        where: {
          participants_ids: {
            has: userId,
          },
        },
        select: { id: true },
      });
      targetConversationIds = userConversations.map((c) => c.id);
    }

    if (targetConversationIds.length === 0) {
      return { data: [], count: 0 };
    }

    const archivedMessages = await this.prisma.message.findMany({
      where: {
        conversationId: { in: targetConversationIds },
        isArchived: true,
      },
      orderBy: {
        archivedAt: 'desc',
      },
    });

    const enriched = await this.attachFileMetadata(archivedMessages);
    return {
      data: enriched,
      count: enriched.length,
    };
  }
}
