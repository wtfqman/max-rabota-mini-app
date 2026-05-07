import type { UploadedPhoto } from '../vacancies/create-vacancy.types.js';
import { apiClient } from '../../shared/api/client.js';

export async function uploadAdPhotos(files: File[], altText: string, maxFiles = 8): Promise<UploadedPhoto[]> {
  const images = files.slice(0, maxFiles);
  const uploaded: UploadedPhoto[] = [];

  for (const file of images) {
    const dataUrl = await fileToDataUrl(file);
    const response = await apiClient.uploadPhoto({
      fileName: file.name,
      mimeType: normalizeMimeType(file.type),
      dataUrl,
      altText
    });

    uploaded.push(response.data);
  }

  return uploaded;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Не удалось прочитать фото'));
      }
    });
    reader.addEventListener('error', () => reject(new Error('Не удалось прочитать фото')));
    reader.readAsDataURL(file);
  });
}

function normalizeMimeType(mimeType: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (mimeType === 'image/png' || mimeType === 'image/webp') {
    return mimeType;
  }

  return 'image/jpeg';
}
