import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadFileDto } from './dto/file.dto';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function detectImageMimeFromBytes(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 6) {
    const header = buf.subarray(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) {
    return 'image/bmp';
  }
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'hevc', 'mif1'].includes(brand)) return 'image/heic';
  }
  return null;
}

@Injectable()
export class FileService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadFile(dto: UploadFileDto, userId: string) {
    let rawData = (dto.data || '').trim();
    let declaredMime = dto.mime_type?.trim();

    const dataUrlMatch = rawData.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUrlMatch) {
      declaredMime = declaredMime || dataUrlMatch[1];
      rawData = dataUrlMatch[2].replace(/\s+/g, '');
    } else {
      rawData = rawData.replace(/\s+/g, '');
    }

    if (!rawData || !/^[A-Za-z0-9+/=]+$/.test(rawData)) {
      throw new BadRequestException('Invalid base64 payload');
    }

    const buffer = Buffer.from(rawData, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }
    if (buffer.length > MAX_FILE_BYTES) {
      throw new PayloadTooLargeException('File larger than 10 MB');
    }

    const detectedImageMime = detectImageMimeFromBytes(buffer);
    const kind = detectedImageMime ? 'IMAGE' : 'FILE';
    const mimeType = detectedImageMime || declaredMime || 'application/octet-stream';

    const created = await this.prisma.file.create({
      data: {
        name: dto.file_name,
        mimeType,
        size: buffer.length,
        kind,
        data: rawData,
        uploadedBy: userId,
      },
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

    return {
      ...created,
      downloadUrl: `/file/${created.id}/download`,
    };
  }

  private async verifyAccess(fileId: string, uploaderId: string, userId: string) {
    if (uploaderId === userId) return;

    const linkedMessages = await this.prisma.message.findMany({
      where: { fileId },
      select: { conversationId: true },
    });

    const convIds = linkedMessages.map((m) => m.conversationId);
    if (convIds.length === 0) {
      throw new ForbiddenException('No access to this file');
    }

    const sharedConv = await this.prisma.conversation.findFirst({
      where: {
        id: { in: convIds },
        participants_ids: { has: userId },
      },
      select: { id: true },
    });

    if (!sharedConv) {
      throw new ForbiddenException('No access to this file');
    }
  }

  async getFile(fileId: string, userId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException(`File '${fileId}' not found`);
    }

    await this.verifyAccess(file.id, file.uploadedBy, userId);

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      kind: file.kind,
      uploadedBy: file.uploadedBy,
      createdAt: file.createdAt,
      downloadUrl: `/file/${file.id}/download`,
      data: file.data,
    };
  }
}
