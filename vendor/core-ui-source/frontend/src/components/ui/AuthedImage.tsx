import type { ImgHTMLAttributes } from 'react';

import {
  apiPathFromDisplayUrl,
  downloadFallbackFromThumbPath,
  useAuthedApiImage,
} from '../../hooks/useAuthedApiImage';
import { urlNeedsAuthFetch } from '../../utils/entryMedia';

export interface AuthedImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
}

/**
 * Renders an image from an external URL directly, or fetches auth-gated
 * ``/api/…`` paths via apiClient and displays a blob URL (same pattern
 * as Avatar).
 */
export function AuthedImage({ src, alt, className, ...rest }: AuthedImageProps) {
  const needsAuth = urlNeedsAuthFetch(src);
  const apiPath = needsAuth ? apiPathFromDisplayUrl(src) : undefined;
  const fallbackPath = downloadFallbackFromThumbPath(apiPath);
  const blobUrl = useAuthedApiImage(apiPath, fallbackPath);
  const effectiveSrc = needsAuth ? blobUrl : src;

  if (!effectiveSrc) {
    return (
      <div
        className={`${className ?? ''} animate-pulse bg-[var(--panel-2)]`}
        role="img"
        aria-label={alt}
        aria-busy="true"
      />
    );
  }

  return (
    <img
      src={effectiveSrc}
      alt={alt}
      className={className}
      {...rest}
    />
  );
}
