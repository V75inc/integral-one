import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import { LINE_ICON_STROKE } from '../../components/ui';
import { Text } from '../../ui';

/**
 * Settings hash section that deep-links to the workspace Document Templates area.
 */
export function DocumentTemplatesSettingsLink() {
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId || '';

  return (
    <div className="flex flex-col gap-3 max-w-xl">
      <Text as="h2" variant="heading-md">Document Templates</Text>
      <Text as="p" variant="body" tone="muted">
        Create reusable merge templates with field tokens, publish immutable
        versions, and generate PDF/HTML/DOCX from entry context.
      </Text>
      {workspaceId ? (
        <Link
          to={`/workspaces/${workspaceId}/document-templates`}
          className="inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline w-fit"
        >
          <FileText size={16} strokeWidth={LINE_ICON_STROKE} />
          Open Document Templates
        </Link>
      ) : (
        <Text as="p" variant="body" tone="muted">
          Select a workspace to manage document templates.
        </Text>
      )}
    </div>
  );
}
