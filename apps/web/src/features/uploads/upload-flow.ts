import type { UploadedPhoto } from '../vacancies/create-vacancy.types.js';
import { apiClient } from '../../shared/api/client.js';

export type UploadMediaMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/webm';

export const supportedImageMimeTypes: UploadMediaMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

export const supportedVideoMimeTypes: UploadMediaMimeType[] = [
  'video/mp4',
  'video/quicktime',
  'video/webm'
];

export const supportedMediaMimeTypes: UploadMediaMimeType[] = [
  ...supportedImageMimeTypes,
  ...supportedVideoMimeTypes
];

export const unsupportedMediaMessage =
  'Поддерживаются фото JPEG, PNG, WebP и видео MP4, MOV, WebM. Уже добавленные файлы сохранены.';

interface UploadAdMediaLimits {
  maxPhotos?: number;
  maxVideos?: number;
}

export async function uploadAdMedia(
  files: File[],
  altText: string,
  limits: UploadAdMediaLimits = {}
): Promise<UploadedPhoto[]> {
  const media = selectSupportedMedia(files, limits);
  const uploaded: UploadedPhoto[] = [];

  for (const file of media) {
    const mimeType = normalizeMimeType(file.type, file.name);

    if (!(await hasSupportedMediaSignature(file, mimeType))) {
      throw new Error(unsupportedMediaMessage);
    }

    const dataUrl = await fileToDataUrl(file);
    const response = await apiClient.uploadMedia({
      fileName: file.name,
      mimeType,
      dataUrl,
      altText
    });

    uploaded.push(response.data);
  }

  return uploaded;
}

export async function uploadAdPhotos(files: File[], altText: string, maxFiles = 8): Promise<UploadedPhoto[]> {
  return uploadAdMedia(files, altText, { maxPhotos: maxFiles, maxVideos: 0 });
}

export function isSupportedImageFile(file: File): boolean {
  const mimeType = normalizeMimeType(file.type, file.name, false);
  return Boolean(mimeType && supportedImageMimeTypes.includes(mimeType));
}

export function isSupportedVideoFile(file: File): boolean {
  const mimeType = normalizeMimeType(file.type, file.name, false);
  return Boolean(mimeType && supportedVideoMimeTypes.includes(mimeType));
}

export function isSupportedMediaFile(file: File): boolean {
  const mimeType = normalizeMimeType(file.type, file.name, false);
  return Boolean(mimeType && supportedMediaMimeTypes.includes(mimeType));
}

export function normalizeMimeType(mimeType: string, fileName = '', fallbackToJpeg = true): UploadMediaMimeType {
  const normalizedMimeType = mimeType.toLowerCase();

  if (supportedMediaMimeTypes.includes(normalizedMimeType as UploadMediaMimeType)) {
    return normalizedMimeType as UploadMediaMimeType;
  }

  if (/\.png(?:[?#].*)?$/i.test(fileName)) {
    return 'image/png';
  }

  if (/\.webp(?:[?#].*)?$/i.test(fileName)) {
    return 'image/webp';
  }

  if (/\.(mp4|m4v)(?:[?#].*)?$/i.test(fileName)) {
    return 'video/mp4';
  }

  if (/\.mov(?:[?#].*)?$/i.test(fileName)) {
    return 'video/quicktime';
  }

  if (/\.webm(?:[?#].*)?$/i.test(fileName)) {
    return 'video/webm';
  }

  if (/\.jpe?g(?:[?#].*)?$/i.test(fileName)) {
    return 'image/jpeg';
  }

  return fallbackToJpeg ? 'image/jpeg' : ('' as UploadMediaMimeType);
}

function selectSupportedMedia(files: File[], limits: UploadAdMediaLimits): File[] {
  const maxPhotos = limits.maxPhotos ?? 8;
  const maxVideos = limits.maxVideos ?? 1;
  const photos: File[] = [];
  const videos: File[] = [];

  for (const file of files) {
    if (isSupportedImageFile(file) && photos.length < maxPhotos) {
      photos.push(file);
      continue;
    }

    if (isSupportedVideoFile(file) && videos.length < maxVideos) {
      videos.push(file);
    }
  }

  return [...photos, ...videos];
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Не удалось прочитать файл'));
      }
    });
    reader.addEventListener('error', () => reject(new Error('Не удалось прочитать файл')));
    reader.readAsDataURL(file);
  });
}

async function hasSupportedMediaSignature(file: File, mimeType: UploadMediaMimeType): Promise<boolean> {
  if (mimeType.startsWith('image/')) {
    return hasSupportedImageSignature(file, mimeType);
  }

  return hasSupportedVideoSignature(file, mimeType);
}

async function hasSupportedImageSignature(file: File, mimeType: UploadMediaMimeType): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  return bytesToAscii(bytes.slice(0, 4)) === 'RIFF' && bytesToAscii(bytes.slice(8, 12)) === 'WEBP';
}

async function hasSupportedVideoSignature(file: File, mimeType: UploadMediaMimeType): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (mimeType === 'video/webm') {
    return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }

  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') {
    return bytes.length >= 12 && bytesToAscii(bytes.slice(4, 8)) === 'ftyp';
  }

  return false;
}

function bytesToAscii(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

export function isImageMedia(media: { mimeType?: string | null }): boolean {
  return !media.mimeType || media.mimeType.startsWith('image/');
}

export function isVideoMedia(media: { mimeType?: string | null }): boolean {
  return Boolean(media.mimeType?.startsWith('video/'));
}

export function normalizeAdMedia(media: UploadedPhoto[], maxPhotos = 8, maxVideos = 1): UploadedPhoto[] {
  const photos: UploadedPhoto[] = [];
  const videos: UploadedPhoto[] = [];

  for (const item of media) {
    if (isVideoMedia(item)) {
      if (videos.length < maxVideos) {
        videos.push(item);
      }
      continue;
    }

    if (photos.length < maxPhotos) {
      photos.push(item);
    }
  }

  return [...photos, ...videos];
}

export function getCoverMedia(media: UploadedPhoto[]): UploadedPhoto | null {
  return media.find(isImageMedia) ?? media[0] ?? null;
}
