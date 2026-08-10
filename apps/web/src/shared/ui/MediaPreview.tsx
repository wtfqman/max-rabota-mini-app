import { useEffect, useRef, useState } from 'react';
import { ImageOff, Video } from 'lucide-react';

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasError, setHasError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src, mimeType]);

  useEffect(() => {
    const element = containerRef.current;

    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShouldLoad(entry.isIntersecting);
      },
      {
        rootMargin: '420px 0px'
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [src]);

  const handleInvalidMedia = () => {
    setHasError(true);
    onInvalid?.();
  };

  if (hasError) {
    return (
      <div
        ref={containerRef}
        className={mergeClassName('flex flex-col items-center justify-center gap-2 bg-surface-900 px-3 text-center text-xs font-semibold leading-4 text-text-muted', className)}
      >
        <ImageOff size={22} className="text-text-muted" />
        <span>Не удалось загрузить медиа</span>
      </div>
    );
  }

  if (!shouldLoad) {
    return <div ref={containerRef} className={mergeClassName('bg-surface-800 soft-shimmer', className)} aria-label={alt || 'Медиа'} />;
  }

  if (isVideoMedia(src, mimeType)) {
    if (!controls) {
      return (
        <div
          ref={containerRef}
          className={mergeClassName(
            'flex flex-col items-center justify-center gap-1 bg-surface-900 px-3 text-center text-xs font-semibold leading-4 text-text-muted',
            className
          )}
          aria-label={alt || 'Видео'}
        >
          <Video size={24} className="text-text-muted" />
          <span>Видео</span>
        </div>
      );
    }

    return (
      <div ref={containerRef} className={mergeClassName('overflow-hidden', className)}>
        <video
          src={src}
          className="h-full w-full object-cover"
          controls={controls}
          muted={!controls}
          playsInline
          preload="metadata"
          onError={handleInvalidMedia}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={mergeClassName('overflow-hidden', className)}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        loading={loading}
        decoding="async"
        onError={handleInvalidMedia}
      />
    </div>
  );
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
