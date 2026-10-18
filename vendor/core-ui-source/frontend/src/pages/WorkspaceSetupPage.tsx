import { PageMeta } from '../components/ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { workspacesApi, SUGGESTED_WORKSPACE_TYPES } from '../api/workspaces';
import { Button, IconWell, LINE_ICON_STROKE } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePublishPageContext } from '../hooks/usePublishPageContext';

/** Standalone "Create a workspace" entry point — reached from the
 *  WorkspaceSwitcher footer action. Any authenticated user can create
 *  workspaces of either type (Company or Personal); the per-user
 *  auto-provisioned Personal at signup is in addition to anything created
 *  here. */
export function WorkspaceSetupPage() {
  const { user, refreshUser } = useAuth();

  usePublishPageContext({ pageKind: 'workspace_setup' });
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspaceType, setWorkspaceType] = useState<string>(
    SUGGESTED_WORKSPACE_TYPES[0].value
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Workspace name is required', 'error');
      return;
    }
    setLoading(true);
    try {
      const ws = await workspacesApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        workspace_type: workspaceType,
      });
      await refreshUser();
      showToast('Workspace created — you are the owner', 'success');
      navigate(`/workspaces/${ws.id}`);
    } catch (err: unknown) {
      showToast(
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Failed to create workspace',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="app-card p-8">
        <div className="flex items-center gap-2 text-[var(--text-muted)] mb-2">
          <IconWell size="sm" aria-hidden>
            <Building2 size={18} strokeWidth={LINE_ICON_STROKE} />
          </IconWell>
          <span className="text-sm font-semibold uppercase tracking-wide">
            Workspace setup
          </span>
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--text)]">
          Create a workspace
        </h1>
        <PageMeta as="p" className="mb-6">
          Hi{user?.display_name ? `, ${user.display_name}` : ''}. You’ll be the
          workspace owner and can invite members next.
        </PageMeta>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <span className="text-sm font-medium text-[var(--text)] block mb-1.5">
              Workspace type
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED_WORKSPACE_TYPES.map(opt => {
                const checked = workspaceType === opt.value;
                const isDisabled = !!opt.disabled;
                return (
                  <label
                    key={opt.value}
                    className={[
                      'flex items-start gap-3',
                      isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                      'rounded-[var(--radius-input)] border p-3',
                      'transition-colors duration-fast',
                      checked
                        ? 'border-[var(--text-muted)] bg-[var(--panel-2)]'
                        : 'border-[var(--panel-border)] bg-[var(--panel)]',
                      !isDisabled && !checked ? 'hover:border-[var(--text-subtle)]' : '',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="workspace-type"
                      checked={checked}
                      disabled={isDisabled}
                      onChange={() => !isDisabled && setWorkspaceType(opt.value)}
                      className="mt-0.5 shrink-0 accent-[var(--cta-bg)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--text)]">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)] leading-relaxed">
                        {opt.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label htmlFor="ws-name" className="text-sm font-medium text-[var(--text)] block mb-1.5">
              Workspace name *
            </label>
            <input
              id="ws-name"
              className="app-input"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. Acme Corp"
            />
          </div>
          <div>
            <label htmlFor="ws-desc" className="text-sm font-medium text-[var(--text)] block mb-1.5">
              Description
            </label>
            <textarea
              id="ws-desc"
              className="app-input resize-none"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" variant="primary" loading={loading}>
              Create & continue
            </Button>
            <Link to="/">
              <Button type="button" variant="ghost">
                Skip for now
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
