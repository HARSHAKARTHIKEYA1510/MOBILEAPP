import { prisma } from './db.mjs';

export const fileMetadataSelect = {
  id: true,
  name: true,
  mimeType: true,
  size: true,
  kind: true,
  storagePath: true,
  uploadedBy: true,
  createdAt: true,
};

export function formatFileInfo(f) {
  if (!f) return null;
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    kind: f.kind,
    uploadedBy: f.uploadedBy,
    createdAt: f.createdAt.toISOString ? f.createdAt.toISOString() : f.createdAt,
    downloadUrl: `/file/${encodeURIComponent(f.id)}`,
  };
}

export async function handleUploadFile(body, me) {
  const fileName = typeof body.file_name === 'string' && body.file_name.trim() ? body.file_name.trim() : 'upload.bin';
  const mimeType = typeof body.mime_type === 'string' && body.mime_type.trim() ? body.mime_type.trim() : 'application/octet-stream';
  const base64 = typeof body.data === 'string' ? body.data.trim() : '';

  if (!base64) {
    const err = new Error('File data is required (base64 string)');
    err.status = 400;
    throw err;
  }

  const approxBytes = Math.round((base64.length * 3) / 4);
  if (approxBytes > 10 * 1024 * 1024) {
    const err = new Error('File exceeds maximum size of 10 MB');
    err.status = 413;
    throw err;
  }

  const kind = mimeType.startsWith('image/') ? 'IMAGE' : 'FILE';

  const record = await prisma.file.create({
    data: {
      name: fileName,
      mimeType,
      size: approxBytes,
      kind,
      storagePath: `db://${fileName}`,
      content: base64,
      uploadedBy: me.id,
    },
    select: fileMetadataSelect,
  });

  return formatFileInfo(record);
}

export async function handleGetFile(fileId) {
  const record = await prisma.file.findUnique({
    where: { id: fileId },
  });

  if (!record) {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }

  const meta = formatFileInfo(record);
  return {
    ...meta,
    data: record.content || '',
  };
}
