import { useId, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2 } from 'lucide-react';
import { usersApi } from '../../api/users';
import { workspacesApi } from '../../api/workspaces';
import { Avatar, type AvatarRingVariant } from './Avatar';
import { LINE_ICON_STROKE } from './IconWell';

interface UserTarget {
  kind: 'user';
  id: string;
}

interface WorkspaceTarget {
  kind: 'workspace';
  id: string;
}

type Target = UserTarget | WorkspaceTarget;

interface AvatarSlot {
  /** Display name — used for the colored-initials fallback when no
   *  image is loaded yet. */
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Legacy pasted URL (workspace path uses this — the served URL is
   *  written onto ``workspace.avatar_url`` after upload). */
  url?: string;
  /** User-pipeline attachment id (Avatar resolves the canonical 128-px
   *  variant URL). Pair with ``userId``. Workspace path leaves this
   *  empty and uses ``url`` instead. */
  attachmentId?: string;
  /** User id for ``GET /api/users/{id}/avatar?size=N`` resolution. */
  userId?: string;
  /** Cache-bust token (typically ``updated_at``). */
  version?: string | number;
  ringVariant?: AvatarRingVariant;
  accentColor?: string | null;
}

interface Props {
  /** The owning resource for the avatar. */
  target: Target;
  /** Avatar render config — passed through to the embedded ``<Avatar>``. */
  avatar: AvatarSlot;
  /** Optional callback fired with the new ``avatar_attachment_id`` after
   *  a successful upload. */
  onUploaded?: (attachmentId: string, updatedAt: string) => void;
  /** Override the hover-overlay label (default: "Change avatar" /
   *  "Change logo" depending on target kind). Also used as the ``aria-label``
   *  for screen readers. */
  buttonLabel?: string;
  className?: string;
}

/**
 * Phase 9 — Facebook-style avatar upload affordance.
 *
 * The avatar IS the upload control. A pressable wrapper renders the
 * existing ``<Avatar>`` primitive; on hover a dark scrim with a camera
 * glyph overlays it. Click opens the file picker. Loading state swaps
 * the camera for a spinner over a dimmed avatar; failures surface
 * inline beneath via the design-system danger tokens.
 *
 * Used for BOTH User avatars (``target: {kind: 'user', id}``) and
 * Workspace logos (``target: {kind: 'workspace', id}``). Backend
 * permission gates differ (User = self-only; Workspace = owner OR
 * admin), but the UX is identical and the upload pipeline (Pillow
 * resize + variant attachments + HAS_ATTACHMENT edge) is shared.
 */
export function AvatarUploadControl({
  target,
  avatar,
  onUploaded,
  buttonLabel,
  className = '',
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const defaultLabel =
    target.kind === 'user' ? 'Change avatar' : 'Change logo';
  const label = buttonLabel || defaultLabel;

  const trigger = () => {
    if (busy) return;
    fileRef.current?.click();
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res =
        target.kind === 'user'
          ? await usersApi.uploadAvatar(target.id, file)
          : await workspacesApi.uploadAvatar(target.id, file);
      const queryKey =
        target.kind === 'user'
          ? ['users', target.id]
          : ['workspaces', target.id];
      qc.invalidateQueries({ queryKey });
      if (target.kind === 'workspace') {
        qc.invalidateQueries({ queryKey: ['workspaces'] });
      }
      onUploaded?.(res.avatar_attachment_id, res.updated_at);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err as Error).message ||
        'Avatar upload failed';
      setError(message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const sizeToOverlayIcon: Record<NonNullable<AvatarSlot['size']>, number> = {
    xs: 10,
    sm: 14,
    md: 18,
    lg: 22,
    xl: 28,
  };
  const iconPx = sizeToOverlayIcon[avatar.size || 'md'];

  // ``xl`` size — discoverability matters at this scale (it reads as
  // primary identity, not a hover-target). Show a persistent "Edit"
  // banner across the bottom third of the avatar so the user knows
  // it's clickable without needing to discover-by-hover. Smaller
  // sizes (xs..lg) keep the hover-only camera scrim from the Facebook
  // pattern — at thumbnail scales a permanent banner crowds the
  // glyph.
  const isLarge = (avatar.size || 'md') === 'xl';

  const overlay: ReactNode = busy ? (
    <span
      aria-hidden
      className="
        absolute inset-0 flex items-center justify-center
        rounded-full bg-black/55 text-white
        transition-opacity duration-fast
      "
    >
      <Loader2
        size={iconPx}
        strokeWidth={LINE_ICON_STROKE}
        className="animate-spin"
      />
    </span>
  ) : isLarge ? (
    <>
      {/* Persistent bottom "Edit" banner — always visible at xl scale */}
      <span
        aria-hidden
        className="
          absolute inset-x-0 bottom-0
          flex items-center justify-center gap-1
          rounded-b-full bg-black/55 text-white
          text-[11px] font-medium uppercase tracking-[0.08em]
          py-1.5
          transition-opacity duration-fast
          group-hover:opacity-0 group-focus-visible:opacity-0
        "
      >
        <Camera size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        <span>Edit</span>
      </span>
      {/* Full-scrim hover state — replaces the persistent banner on
          hover/focus with the centered camera glyph for richer
          affordance once the user already engaged. */}
      <span
        aria-hidden
        className="
          absolute inset-0 flex items-center justify-center
          rounded-full bg-black/55 text-white
          opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100
          transition-opacity duration-fast
        "
      >
        <Camera size={iconPx} strokeWidth={LINE_ICON_STROKE} />
      </span>
    </>
  ) : (
    <span
      aria-hidden
      className="
        absolute inset-0 flex items-center justify-center
        rounded-full bg-black/55 text-white
        opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100
        transition-opacity duration-fast
      "
    >
      <Camera size={iconPx} strokeWidth={LINE_ICON_STROKE} />
    </span>
  );

  return (
    <div className={`flex flex-col items-start gap-1.5 min-w-0 ${className}`}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onPick}
        disabled={busy}
        aria-describedby={error ? errorId : undefined}
        className="sr-only"
        aria-label={label}
      />
      <button
        type="button"
        onClick={trigger}
        disabled={busy}
        aria-label={label}
        title={label}
        className="
          group relative inline-flex shrink-0
          rounded-full overflow-hidden
          transition-transform duration-fast
          hover:scale-[1.02]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel)]
          disabled:cursor-not-allowed
        "
      >
        <Avatar
          name={avatar.name}
          size={avatar.size || 'md'}
          url={avatar.url}
          attachmentId={avatar.attachmentId}
          userId={avatar.userId}
          version={avatar.version}
          ringVariant={avatar.ringVariant || 'default'}
          accentColor={avatar.accentColor}
        />
        {overlay}
      </button>
      {error ? (
        <div
          id={errorId}
          role="alert"
          className="
            rounded-[var(--radius-input)]
            bg-[var(--danger-bg)] text-[var(--danger-fg)]
            border border-[color:var(--danger-fg)]/20
            px-2.5 py-1.5 text-xs max-w-[260px]
          "
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
