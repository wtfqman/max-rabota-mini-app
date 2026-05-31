import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Camera, FileVideo, ImagePlus, Loader2, X } from 'lucide-react';
import type { UploadedPhoto } from '../../features/vacancies/create-vacancy.types.js';
import {
  getCoverMedia,
  isSupportedImageFile,
  isSupportedMediaFile,
  isSupportedVideoFile,
  isVideoMedia,
  normalizeAdMedia,
  unsupportedMediaMessage,
  uploadAdMedia
} from '../../features/uploads/upload-flow.js';
import { getUserFacingError } from '../api/user-facing.js';
import { MediaPreview } from './MediaPreview.js';

interface PhotoUploaderProps {
  photos?: UploadedPhoto[];
  maxFiles?: number;
  maxVideos?: number;
  altText?: string;
  onPhotosChange?: (photos: UploadedPhoto[]) => void;
  onBusyChange?: (isBusy: boolean) => void;
}

const acceptedMediaTypes = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.m4v,.webm';

export function PhotoUploader({
  photos,
  maxFiles = 8,
  maxVideos = 1,
  altText = 'Медиа объявления',
  onPhotosChange,
  onBusyChange
}: PhotoUploaderProps) {
  const [internalPhotos, setInternalPhotos] = useState<UploadedPhoto[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const value = normalizeAdMedia(photos ?? internalPhotos, maxFiles, maxVideos);
  const valueRef = useRef(value);
  const photoCount = value.filter((item) => !isVideoMedia(item)).length;
  const videoCount = value.filter(isVideoMedia).length;
  const availablePhotoSlots = Math.max(maxFiles - photoCount, 0);
  const availableVideoSlots = Math.max(maxVideos - videoCount, 0);
  const canAddMedia = availablePhotoSlots > 0 || availableVideoSlots > 0;
  const coverMedia = getCoverMedia(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onBusyChange?.(isUploading);
  }, [isUploading, onBusyChange]);

  const updatePhotos = (nextPhotos: UploadedPhoto[]) => {
    const nextValue = normalizeAdMedia(nextPhotos, maxFiles, maxVideos);

    if (onPhotosChange) {
      onPhotosChange(nextValue);
      return;
    }

    setInternalPhotos(nextValue);
  };

  const appendSelectedFiles = async (fileList: FileList | null) => {
    const selectedFiles = Array.from(fileList ?? []);
    resetInput(inputRef.current);

    if (selectedFiles.length === 0) {
      return;
    }

    if (!canAddMedia) {
      setNotice(getMaxFilesMessage(maxFiles, maxVideos));
      return;
    }

    const supportedFiles = selectedFiles.filter(isSupportedMediaFile);
    const imageFiles = supportedFiles.filter(isSupportedImageFile).slice(0, availablePhotoSlots);
    const videoFiles = supportedFiles.filter(isSupportedVideoFile).slice(0, availableVideoSlots);
    const filesToUpload = [...imageFiles, ...videoFiles];
    const rejectedCount = selectedFiles.length - supportedFiles.length;
    const overflowCount = supportedFiles.length - filesToUpload.length;

    if (rejectedCount > 0) {
      setNotice(unsupportedMediaMessage);
    } else if (overflowCount > 0) {
      setNotice(getMaxFilesMessage(maxFiles, maxVideos));
    } else {
      setNotice(null);
    }

    if (filesToUpload.length === 0) {
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);
      const uploaded = await uploadAdMedia(filesToUpload, altText, {
        maxPhotos: availablePhotoSlots,
        maxVideos: availableVideoSlots
      });
      updatePhotos([...valueRef.current, ...uploaded]);
    } catch (error) {
      setUploadError(getUserFacingError(error, 'photo_upload'));
    } finally {
      setIsUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    updatePhotos(value.filter((_, photoIndex) => photoIndex !== index));
    setUploadError(null);
  };

  return (
    <div className="grid gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-secondary">Медиа</span>
        <span className="text-xs font-semibold text-text-muted">
          {photoCount} фото из {maxFiles}{maxVideos > 0 ? `, ${videoCount} видео из ${maxVideos}` : ''}
        </span>
      </div>

      {notice ? (
        <div className="rounded-panel border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-sm font-semibold leading-5 text-amber-100">
          {notice}
        </div>
      ) : null}

      {uploadError ? (
        <div className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-semibold leading-5 text-red-100">
          {uploadError}
        </div>
      ) : null}

      {value.length === 0 ? (
        <label className="group flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-panel border border-dashed border-accent-green/45 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.14),transparent_44%),rgba(255,255,255,0.03)] px-3 text-center transition hover:border-accent-green hover:bg-accent-greenSoft/70 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-green active:scale-[0.985]">
          <span className="flex h-12 w-12 items-center justify-center rounded-panel border border-accent-green/25 bg-accent-greenSoft text-accent-green transition group-hover:scale-105">
            {isUploading ? <Loader2 className="animate-spin" size={23} /> : <ImagePlus size={23} />}
          </span>
          <span className="grid gap-1">
            <span className="text-sm font-black text-text-primary">
              {isUploading ? 'Медиа загружается...' : 'Добавить фото или видео'}
            </span>
            <span className="text-xs leading-4 text-text-secondary">
              Можно добавить до {maxFiles} фото и {maxVideos} видео. Первое фото станет обложкой, видео не заменяет фото.
            </span>
          </span>
          <MediaInput inputRef={inputRef} isUploading={isUploading} onChange={appendSelectedFiles} />
        </label>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((photo, index) => {
            const isVideo = isVideoMedia(photo);
            const isCover = coverMedia?.storageKey === photo.storageKey && !isVideo;

            return (
              <div key={`${photo.storageKey}-${index}`} className="group relative aspect-square overflow-hidden rounded-panel border border-white/8 bg-surface-900">
                <MediaPreview
                  src={photo.previewUrl ?? photo.url}
                  mimeType={photo.mimeType}
                  alt={photo.altText ?? altText}
                  className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                  controls={false}
                />
                {isCover ? (
                  <span className="absolute left-2 top-2 rounded-full bg-surface-950/80 px-2 py-1 text-[11px] font-semibold text-white">
                    Обложка
                  </span>
                ) : null}
                {isVideo ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface-950/80 px-2 py-1 text-[11px] font-semibold text-white">
                    <FileVideo size={12} /> Видео
                  </span>
                ) : null}
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface-950/80 text-text-primary transition hover:bg-red-500/80 active:scale-95"
                  aria-label="Удалить медиа"
                  onClick={() => removePhoto(index)}
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}

          {canAddMedia ? (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-accent-green/45 bg-accent-greenSoft/80 text-sm font-extrabold text-accent-green transition hover:border-accent-green hover:bg-accent-greenSoft focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-green active:scale-[0.985]">
              {isUploading ? <Loader2 className="animate-spin" size={22} /> : <ImagePlus size={22} />}
              <span>{isUploading ? 'Загрузка...' : 'Добавить'}</span>
              <MediaInput inputRef={inputRef} isUploading={isUploading} onChange={appendSelectedFiles} />
            </label>
          ) : null}

          {isUploading ? (
            <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-panel border border-accent-green/20 bg-accent-greenSoft/70 text-center text-xs font-semibold text-accent-green">
              <Loader2 className="animate-spin" size={22} />
              <span>Загружаем</span>
            </div>
          ) : null}

          {Array.from({ length: Math.min(2, Math.max(availablePhotoSlots + availableVideoSlots, 0)) }).map((_, index) => (
            <div
              key={`slot-${index}`}
              className="flex aspect-square items-center justify-center rounded-panel border border-white/8 bg-white/[0.02] text-text-muted"
            >
              <Camera size={22} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaInput({
  inputRef,
  isUploading,
  onChange
}: {
  inputRef: MutableRefObject<HTMLInputElement | null>;
  isUploading: boolean;
  onChange: (fileList: FileList | null) => void;
}) {
  return (
    <input
      ref={inputRef}
      className="sr-only"
      type="file"
      accept={acceptedMediaTypes}
      multiple
      disabled={isUploading}
      onChange={(event) => void onChange(event.target.files)}
    />
  );
}

function getMaxFilesMessage(maxFiles: number, maxVideos: number) {
  return `Можно добавить до ${maxFiles} фото и ${maxVideos} видео. Лишние файлы не добавлены, уже загруженные медиа сохранены.`;
}

function resetInput(input: HTMLInputElement | null) {
  if (input) {
    input.value = '';
  }
}
