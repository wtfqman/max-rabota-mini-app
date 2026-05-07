import type { UploadedPhoto } from './create-vacancy.types.js';
import { uploadAdPhotos } from '../uploads/upload-flow.js';

export async function uploadVacancyPhotos(files: File[], altText: string): Promise<UploadedPhoto[]> {
  return uploadAdPhotos(files, altText, 8);
}
