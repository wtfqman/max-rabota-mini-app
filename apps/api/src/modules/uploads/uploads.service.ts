import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { UploadsRepository } from './uploads.repository.js';
import type { UploadPhotoDto } from './uploads.schemas.js';

export class UploadsService extends FoundationService {
  constructor(repository: UploadsRepository) {
    super(repository);
  }

  async uploadPhoto(dto: UploadPhotoDto) {
    const buffer = this.decodeDataUrl(dto.dataUrl, dto.mimeType);

    if (buffer.byteLength > 5 * 1024 * 1024) {
      throw new AppError('Photo is too large', 400, {
        maxSizeBytes: 5 * 1024 * 1024
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

  private decodeDataUrl(dataUrl: string, mimeType: string): Buffer {
    const prefix = `data:${mimeType};base64,`;

    if (!dataUrl.startsWith(prefix)) {
      throw new AppError('Invalid photo payload', 400);
    }

    return Buffer.from(dataUrl.slice(prefix.length), 'base64');
  }

  private getExtension(mimeType: string): string {
    if (mimeType === 'image/png') {
      return 'png';
    }

    if (mimeType === 'image/webp') {
      return 'webp';
    }

    return 'jpg';
  }
}
