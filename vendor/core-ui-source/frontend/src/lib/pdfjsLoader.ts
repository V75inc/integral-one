/** Shared pdf.js bootstrap — worker served from ``/public/pdfjs/``. */

type PdfModule = typeof import('pdfjs-dist');

let pdfModulePromise: Promise<PdfModule> | null = null;

const PDFJS_WORKER_SRC = '/pdfjs/pdf.worker.min.mjs';

export async function getPdfjs(): Promise<PdfModule> {
  if (!pdfModulePromise) {
    pdfModulePromise = (async () => {
      const mod = await import('pdfjs-dist');
      mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      return mod;
    })();
  }
  return pdfModulePromise;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read blob'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function assertPdfBlob(blob: Blob): Promise<Blob> {
  const buf = await blobToBytes(blob);
  const magic = String.fromCharCode(...buf.slice(0, 5));
  if (magic.startsWith('%PDF')) {
    return new Blob([new Uint8Array(buf)], { type: 'application/pdf' });
  }
  const text = new TextDecoder().decode(buf);
  let message = 'Contract download did not return a PDF.';
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      message = parsed.message.trim();
    }
  } catch {
    if (text.trim()) {
      message = text.trim().slice(0, 240);
    }
  }
  throw new Error(message);
}
