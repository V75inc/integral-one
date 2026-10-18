import apiClient from './client';

export interface UserSignature {
  id: string;
  filename?: string;
  mime_type?: string;
  size?: number;
  created_at?: string;
  label?: string;
}

export const userSignaturesApi = {
  list: async (): Promise<UserSignature[]> => {
    const resp = await apiClient.get<{ signatures: UserSignature[] }>('/me/signatures');
    return resp.data.signatures || [];
  },

  save: async (signaturePng: string, label = 'Default'): Promise<UserSignature> => {
    const resp = await apiClient.post<UserSignature>('/me/signatures', {
      signature_png: signaturePng,
      label,
    });
    return resp.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/me/signatures/${encodeURIComponent(id)}`);
  },

  downloadUrl: (id: string): string => {
    const base = apiClient.defaults.baseURL || '';
    return `${base}/me/signatures/${encodeURIComponent(id)}/download`;
  },

  /** Authenticated download — use this instead of raw fetch (JWT is not cookie-based). */
  downloadPngBase64: async (id: string): Promise<string> => {
    const resp = await apiClient.get(
      `/me/signatures/${encodeURIComponent(id)}/download`,
      { responseType: 'blob' },
    );
    const blob = resp.data as Blob;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  },
};
