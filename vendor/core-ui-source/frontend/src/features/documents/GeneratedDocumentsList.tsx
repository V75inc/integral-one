import { useQuery } from '@tanstack/react-query';
import { documentsApi } from './api';
import { Button } from '../../components/ui/Button';
import { Text } from '../../ui';

interface Props {
  contextEntryId: string;
}

export function GeneratedDocumentsList({ contextEntryId }: Props) {
  const listQ = useQuery({
    queryKey: ['generated-documents', contextEntryId],
    queryFn: () => documentsApi.listGenerated({ context_entry_id: contextEntryId }),
    enabled: Boolean(contextEntryId),
  });

  const docs = listQ.data?.documents || [];
  if (!listQ.isLoading && docs.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-[var(--panel-border)] p-3">
      <Text as="h3" variant="heading-sm" className="mb-2">
        Generated documents
      </Text>
      {listQ.isLoading ? (
        <Text as="p" variant="body" tone="muted">Loading…</Text>
      ) : (
        <ul className="space-y-2">
          {docs.map(d => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <Text as="span" variant="body" truncate>
                {(d.module || 'doc').toUpperCase()} · {d.output_format || 'file'}
                {d.generated_at ? (
                  <Text as="span" variant="body" tone="muted" className="ml-2">
                    {new Date(d.generated_at).toLocaleString()}
                  </Text>
                ) : null}
              </Text>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const blob = await documentsApi.download(d.id);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `document.${d.output_format || 'bin'}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
