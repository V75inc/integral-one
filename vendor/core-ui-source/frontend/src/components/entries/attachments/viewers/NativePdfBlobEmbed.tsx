import { useEffect, useState } from 'react';

import { ViewerStatus } from './ViewerStatus';

/** Browser-native PDF preview (embed) — reliable when PDF.js worker is unavailable. */
export function NativePdfBlobEmbed({
  blob,
  height = 420,
  title = 'PDF preview',
}: {
  blob: Blob;
  height?: number | string;
  title?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) {
    return <ViewerStatus state="loading" />;
  }

  return (
    <iframe
      title={title}
      src={url}
      className="block w-full rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-white"
      style={{ height, minHeight: 280 }}
    />
  );
}
