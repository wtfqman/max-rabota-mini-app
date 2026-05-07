import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

interface PhotoUploaderProps {
  files?: File[];
  maxFiles?: number;
  onFilesChange?: (files: File[]) => void;
}

export function PhotoUploader({ files, maxFiles = 8, onFilesChange }: PhotoUploaderProps) {
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const value = files ?? internalFiles;
  const previews = useObjectUrls(value);
  const availableSlots = Math.max(maxFiles - value.length, 0);

  const updateFiles = (nextFiles: File[]) => {
    if (onFilesChange) {
      onFilesChange(nextFiles.slice(0, maxFiles));
      return;
    }

    setInternalFiles(nextFiles.slice(0, maxFiles));
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-text-secondary">Фотографии</span>
        <span className="text-xs font-semibold text-text-muted">{value.length} из {maxFiles}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {previews.map((preview, index) => (
          <div key={preview.url} className="group relative aspect-square overflow-hidden rounded-panel border border-white/8 bg-surface-900">
            <img src={preview.url} alt="" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
            {index === 0 ? (
              <span className="absolute left-2 top-2 rounded-full bg-surface-950/80 px-2 py-1 text-[11px] font-semibold text-white">
                Обложка
              </span>
            ) : null}
            <button
              type="button"
              className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface-950/80 text-text-primary transition hover:bg-red-500/80 active:scale-95"
              aria-label="Удалить фото"
              onClick={() => updateFiles(value.filter((_, fileIndex) => fileIndex !== index))}
            >
              <X size={16} />
            </button>
          </div>
        ))}

        {availableSlots > 0 ? (
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-accent-green/30 bg-accent-greenSoft/80 text-sm font-semibold text-accent-green transition hover:border-accent-green hover:bg-accent-greenSoft focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-green active:scale-[0.985]">
            <ImagePlus size={22} />
            <span>Добавить</span>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                const selectedFiles = Array.from(event.target.files ?? []);
                updateFiles([...value, ...selectedFiles]);
                if (inputRef.current) {
                  inputRef.current.value = '';
                }
              }}
            />
          </label>
        ) : null}

        {Array.from({ length: Math.min(2, availableSlots) }).map((_, index) => (
          <div
            key={`slot-${index}`}
            className="flex aspect-square items-center justify-center rounded-panel border border-white/8 bg-white/[0.02] text-text-muted"
          >
            <Camera size={22} />
          </div>
        ))}
      </div>
    </div>
  );
}

function useObjectUrls(files: File[]) {
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file)
      })),
    [files]
  );

  useEffect(
    () => () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    },
    [previews]
  );

  return previews;
}
