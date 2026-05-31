import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { UploadsRepository } from './uploads.repository.js';
import type { UploadMediaDto } from './uploads.schemas.js';

export class UploadsService extends FoundationService {
  private static readonly imageMaxSizeBytes = 5 * 1024 * 1024;
  private static readonly videoMaxSizeBytes = 60 * 1024 * 1024;

  constructor(repository: UploadsRepository) {
    super(repository);
  }

  async uploadMedia(dto: UploadMediaDto) {
    const buffer = this.decodeDataUrl(dto.dataUrl, dto.mimeType);
    const maxSizeBytes = this.getMaxSizeBytes(dto.mimeType);

    if (!this.isSupportedMediaBuffer(buffer, dto.mimeType)) {
      throw new AppError('Invalid upload payload', 400);
    }

    if (buffer.byteLength > maxSizeBytes) {
      throw new AppError('File is too large', 400, {
        maxSizeBytes
      });
    }

    const extension = this.getExtension(dto.mimeType);
    const now = new Date();
    const directory = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const fileName = `${randomUUID()}.${extension}`;
    const storageKey = `${directory}/${fileName}`;
    const uploadsRoot = path.resolve(process.cwd(), 'storage', 'uploads');
    const targetDirectory = path.join(uploadsRoot, directory);
    const targetPath = path.join(targetDirectory, fileName);

    await mkdir(targetDirectory, {
      recursive: true
    });
    await writeFile(targetPath, buffer);

    return {
      storageKey,
      url: `/uploads/${storageKey}`,
      previewUrl: `/uploads/${storageKey}`,
      mimeType: dto.mimeType,
      sizeBytes: buffer.byteLength,
      altText: dto.altText ?? null
    };
  }

  async uploadPhoto(dto: UploadMediaDto) {
    return this.uploadMedia(dto);
  }

  private decodeDataUrl(dataUrl: string, mimeType: string): Buffer {
    const prefix = `data:${mimeType};base64,`;

    if (!dataUrl.startsWith(prefix)) {
      throw new AppError('Invalid upload payload', 400);
    }

    return Buffer.from(dataUrl.slice(prefix.length), 'base64');
  }

  private getMaxSizeBytes(mimeType: string): number {
    if (mimeType.startsWith('video/')) {
      return UploadsService.videoMaxSizeBytes;
    }

    return UploadsService.imageMaxSizeBytes;
  }

  private isSupportedMediaBuffer(buffer: Buffer, mimeType: string): boolean {
    if (mimeType.startsWith('image/')) {
      return this.isSupportedImageBuffer(buffer, mimeType);
    }

    return this.isSupportedVideoBuffer(buffer, mimeType);
  }

  private isSupportedImageBuffer(buffer: Buffer, mimeType: string): boolean {
    if (mimeType === 'image/jpeg') {
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    if (mimeType === 'image/png') {
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    }

    if (mimeType === 'image/webp') {
      return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }

    return false;
  }

  private isSupportedVideoBuffer(buffer: Buffer, mimeType: string): boolean {
    if (mimeType === 'video/webm') {
      return (
        buffer.length >= 4 &&
        buffer[0] === 0x1a &&
        buffer[1] === 0x45 &&
        buffer[2] === 0xdf &&
        buffer[3] === 0xa3
      );
    }

    if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') {
      return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    }

    return false;
  }

  private getExtension(mimeType: string): string {
    if (mimeType === 'image/png') {
      return 'png';
    }

    if (mimeType === 'image/webp') {
      return 'webp';
    }

    if (mimeType === 'video/mp4') {
      return 'mp4';
    }

    if (mimeType === 'video/quicktime') {
      return 'mov';
    }

    if (mimeType === 'video/webm') {
      return 'webm';
    }

    return 'jpg';
  }
}
