import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from '@/firebase/storage';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXACT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/zip',
  'application/x-zip-compressed',
]);

export function isAllowedAttachmentType(file: File): boolean {
  return ALLOWED_EXACT_TYPES.has(file.type) || file.type.startsWith('image/');
}

export interface UploadedAttachment {
  name: string;
  path: string;
  size: number;
  contentType: string;
}

export async function uploadAttachments(basePath: string, files: File[]): Promise<UploadedAttachment[]> {
  return Promise.all(
    files.map(async (file) => {
      const path = `${basePath}/${Date.now()}-${file.name}`;
      const result = await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      return {
        name: file.name,
        path,
        size: result.metadata.size,
        contentType: result.metadata.contentType ?? file.type,
      } satisfies UploadedAttachment;
    }),
  );
}

export async function deleteAttachment(path: string): Promise<void> {
  await deleteObject(storageRef(storage, path)).catch(() => {
    // Already gone — fine, the caller is dropping its reference either way.
  });
}

export function getAttachmentUrl(path: string): Promise<string> {
  return getDownloadURL(storageRef(storage, path));
}
