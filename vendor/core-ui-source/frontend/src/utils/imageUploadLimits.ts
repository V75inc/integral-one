/** Matches Core's default image ceiling and the chat/App image pickers. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Safe, fixed copy that upload consumers can display without server diagnostics. */
export class ImageUploadSizeError extends Error {
  constructor() {
    super('Image too large (maximum 5 MB).');
    this.name = 'ImageUploadSizeError';
  }
}

export function imageExceedsUploadLimit(file: Pick<File, 'name' | 'type' | 'size'>): boolean {
  // File.type can be empty or generic on some platforms. This is a preflight
  // convenience; the server still sniffs actual bytes and enforces its limit.
  const image = file.type.toLowerCase().startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|avif|heic|heif|svg|tiff?|bmp|ico|dwg|dxf|psd)$/i.test(file.name);
  return image && file.size > MAX_IMAGE_BYTES;
}
