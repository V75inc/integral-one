export function mountUpdateIndicator(document: Document, bridge: {
 getState(): Promise<{status: string; version?: string | null}>;
 check(): Promise<unknown>;
 onChange(callback: (state: {status: string; version?: string | null}) => void): () => void;
}): () => void;
