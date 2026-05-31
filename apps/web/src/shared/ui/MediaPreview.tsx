import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface MediaPreviewProps {
  src: string;
  mimeType?: string | null;
  alt?: string;
  className?: string;
  controls?: boolean;
  loading?: 'lazy' | 'eager';
  onInvalid?: () => void;
}

export function MediaPreview({
  src,
  mimeType,
  alt = '',
  className,
  controls = true,
  loading = 'lazy',
  onInvalid
}: MediaPreviewProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src, mimeType]);

  const handleInvalidMedia = () => {
    setHasError(true);
    onInvalid?.();
  };

  if (hasError) {
    return (
      <div className={mergeClassName('flex flex-col items-center justify-center gap-2 bg-surface-900 px-3 text-center text-xs font-semibold leading-4 text-text-muted', className)}>
        <ImageOff size={22} className="text-text-muted" />
        <span>Не удалось загрузить медиа</span>
      </div>
    );
  }

  if (isVideoMedia(src, mimeType)) {
    return (
      <video
        src={src}
        className={className}
        controls={controls}
        muted={!controls}
        playsInline
        preload="metadata"
        onError={handleInvalidMedia}
      />
    );
  }

  return <img src={src} alt={alt} className={className} loading={loading} onError={handleInvalidMedia} />;
}

export function isVideoMedia(src?: string | null, mimeType?: string | null): boolean {
  if (mimeType?.startsWith('video/')) {
    return true;
  }

  return Boolean(src && /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(src));
}

function mergeClassName(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(' ');
}