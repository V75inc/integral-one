import { useState, useEffect } from 'react';
import { Share2, Copy, Check, Globe, Lock, Info } from 'lucide-react';
import { Modal, Button } from '../ui';
import { Text, Surface, Input } from '../../ui';
import { sharingApi } from '../../api/sharing';
import { useToast } from '../../context/ToastContext';

interface TrackShareModalProps {
  open: boolean;
  onClose(): void;
  trackId: string;
  trackTitle: string;
}

export function TrackShareModal({ open, onClose, trackId, trackTitle }: TrackShareModalProps) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [permissions, setPermissions] = useState({
    read_entries: true,
    create_entries: false,
    update_entries: false,
    read_comments: false,
    create_comments: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  // 'manifest' means the App that provisioned this track declared these
  // permissions, so the toggles below are pre-set to the app author's intent.
  const [permissionsSource, setPermissionsSource] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    sharingApi.getPublicTrackSettings(trackId)
      .then(res => {
        if (!active) return;
        setEnabled(res.enabled);
        setPermissionsSource(res.permissions_source);
        // GET never returns plaintext; keep any session-minted token.
        if (res.token) setToken(res.token);
        if (res.public_permissions && Object.keys(res.public_permissions).length > 0) {
          // Merge with default schema
          setPermissions(prev => ({
            ...prev,
            ...res.public_permissions,
          }));
        }
      })
      .catch(() => {
        toast.showToast('Failed to load sharing settings', 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, trackId, toast]);

  const handleSave = async (nextEnabled: boolean, nextPerms = permissions) => {
    setSaving(true);
    try {
      const res = await sharingApi.updatePublicTrackSettings(trackId, nextEnabled, nextPerms);
      setEnabled(res.enabled);
      // Token only on fresh mint; permission updates return null.
      if (res.token) {
        setToken(res.token);
      } else if (!nextEnabled) {
        setToken(null);
      }
      if (res.public_permissions) {
        setPermissions(prev => ({ ...prev, ...res.public_permissions }));
      }
      toast.showToast(nextEnabled ? 'Public sharing enabled' : 'Public sharing disabled', 'success');
    } catch {
      toast.showToast('Failed to update public share settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (key: keyof typeof permissions) => {
    const nextPerms = {
      ...permissions,
      [key]: !permissions[key],
    };
    setPermissions(nextPerms);
    if (enabled) {
      void handleSave(true, nextPerms);
    }
  };

  const shareUrl = token ? `${window.location.origin}/public/tracks/${token}` : '';

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.showToast('Link copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Public Share Settings"
      titleIcon={<Share2 size={16} />}
      width="max-w-[560px]"
    >
      <Modal.Body className="space-y-4">
        <div>
          <Text variant="body" weight="medium" as="h4">
            Share "{trackTitle}"
          </Text>
          <Text variant="meta" tone="muted" as="p" className="mt-1 leading-normal">
            Generate a public link so anyone can view or participate in this track without signing in.
          </Text>
        </div>

        {loading ? (
          <Text variant="body-sm" tone="muted" as="div" className="py-8 text-center animate-pulse">
            Loading settings…
          </Text>
        ) : (
          <div className="space-y-4">
            {/* Status card */}
            <Surface
              tone="panel-2"
              border="none"
              radius="card"
              padding="md"
              className={`transition-all duration-300 flex items-start gap-2.5 ${
                enabled
                  ? 'border border-[var(--brand-accent-fg)]/20 shadow-sm'
                  : 'border border-[var(--panel-border)] opacity-90'
              }`}
            >
              <div className={`p-1.5 rounded-full shrink-0 ${
                enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--badge-muted-bg)] text-[var(--badge-muted-fg)]'
              }`}>
                {enabled ? <Globe size={16} /> : <Lock size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <Text variant="meta" weight="semibold" className="uppercase tracking-[0.06em]">
                    {enabled ? 'Public sharing is active' : 'Private'}
                  </Text>
                  <Button
                    size="xs"
                    variant={enabled ? 'outline' : 'primary'}
                    onClick={() => handleSave(!enabled)}
                    disabled={saving}
                  >
                    {enabled ? 'Disable Link' : 'Enable Link'}
                  </Button>
                </div>
                <Text variant="body-sm" tone="muted" as="p" className="mt-0.5 leading-normal">
                  {enabled
                    ? 'Anyone with the URL below can access this track.'
                    : 'This track is private. Only workspace members can access it.'}
                </Text>
              </div>
            </Surface>

            {/* Public URL Box — shown only when plaintext is available (fresh mint). */}
            {enabled && shareUrl && (
              <div className="space-y-1 animate-fade-in">
                <Text variant="meta" weight="semibold" tone="muted" as="label" className="uppercase tracking-[0.1em]">
                  Public Link URL
                </Text>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    size="sm"
                    readOnly
                    value={shareUrl}
                    onClick={handleCopy}
                    className="flex-1 min-w-0 select-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopy}
                    className="shrink-0"
                    icon={copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}
            {enabled && !shareUrl && (
              <Surface tone="panel-2" padding="sm" className="flex items-start gap-2">
                <Info size={13} className="shrink-0 mt-0.5" />
                <Text variant="meta" tone="muted">
                  Public sharing is on. The link was shown once when created — disable and re-enable to mint a new URL.
                </Text>
              </Surface>
            )}

            {/* Granular Permissions Section */}
            <div className="space-y-2">
              <Text variant="meta" weight="semibold" tone="muted" className="uppercase tracking-[0.15em] block">
                Public Visitor Permissions
              </Text>
              {!enabled && permissionsSource === 'manifest' && (
                <Text variant="meta" tone="muted" as="p" className="leading-normal">
                  Pre-set to the permissions this track&rsquo;s app recommends. Adjust
                  before enabling if you want something different.
                </Text>
              )}

              <Surface
                tone="panel"
                border="none"
                radius="card"
                className="divide-y divide-[var(--panel-border)] border-y border-[var(--panel-border)] overflow-hidden"
              >
                {/* READ permission */}
                <label className="flex items-start justify-between gap-4 py-1.5 px-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-fast cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <Text variant="body-sm" weight="semibold">Browse Entries & Views</Text>
                    <Text variant="meta" tone="muted" as="p" className="leading-normal">
                      Browse entries and switch views.
                    </Text>
                  </div>
                  <input
                    type="checkbox"
                    checked={permissions.read_entries}
                    onChange={() => togglePermission('read_entries')}
                    disabled={saving}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--panel-border)] accent-[var(--brand-accent)] focus:ring-[var(--brand-accent-fg)]"
                  />
                </label>

                {/* CREATE permission */}
                <label className="flex items-start justify-between gap-4 py-1.5 px-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-fast cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <Text variant="body-sm" weight="semibold">Submit New Entries</Text>
                    <Text variant="meta" tone="muted" as="p" className="leading-normal">
                      Submit new entries (shows form if browsing is disabled).
                    </Text>
                  </div>
                  <input
                    type="checkbox"
                    checked={permissions.create_entries}
                    onChange={() => togglePermission('create_entries')}
                    disabled={saving}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--panel-border)] accent-[var(--brand-accent)] focus:ring-[var(--brand-accent-fg)]"
                  />
                </label>

                {/* UPDATE permission */}
                <label className="flex items-start justify-between gap-4 py-1.5 px-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-fast cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <Text variant="body-sm" weight="semibold">Edit & Update Entries</Text>
                    <Text variant="meta" tone="muted" as="p" className="leading-normal">
                      Edit and update entries.
                    </Text>
                  </div>
                  <input
                    type="checkbox"
                    checked={permissions.update_entries}
                    onChange={() => togglePermission('update_entries')}
                    disabled={saving}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--panel-border)] accent-[var(--brand-accent)] focus:ring-[var(--brand-accent-fg)]"
                  />
                </label>

                {/* READ COMMENTS permission */}
                <label className="flex items-start justify-between gap-4 py-1.5 px-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-fast cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <Text variant="body-sm" weight="semibold">Read Comments</Text>
                    <Text variant="meta" tone="muted" as="p" className="leading-normal">
                      View comment threads on entries.
                    </Text>
                  </div>
                  <input
                    type="checkbox"
                    checked={permissions.read_comments}
                    onChange={() => togglePermission('read_comments')}
                    disabled={saving}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--panel-border)] accent-[var(--brand-accent)] focus:ring-[var(--brand-accent-fg)]"
                  />
                </label>

                {/* CREATE COMMENTS permission */}
                <label className="flex items-start justify-between gap-4 py-1.5 px-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-fast cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <Text variant="body-sm" weight="semibold">Add Comments</Text>
                    <Text variant="meta" tone="muted" as="p" className="leading-normal">
                      Post comments on entries.
                    </Text>
                  </div>
                  <input
                    type="checkbox"
                    checked={permissions.create_comments}
                    onChange={() => togglePermission('create_comments')}
                    disabled={saving}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--panel-border)] accent-[var(--brand-accent)] focus:ring-[var(--brand-accent-fg)]"
                  />
                </label>
              </Surface>

              {!permissions.read_entries && permissions.create_entries && (
                <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius-card)] text-[11px] text-amber-500 leading-normal mt-1">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  <span>
                    Browsing is disabled; public users will see a form page.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
