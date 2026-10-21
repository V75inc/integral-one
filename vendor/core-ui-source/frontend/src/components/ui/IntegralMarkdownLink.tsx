import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { isSafeHref, sanitizeMarkdownHref } from '../../utils/safeHref';

export function isInternalAppHref(href: string | undefined): boolean {
  return internalAppHref(href) !== undefined;
}

function typedResourcePath(path: string): string {
  const match = /^\/(n\.(Track|Entry|WorkspaceApp)\.[A-Za-z0-9_-]+)([?#].*)?$/.exec(path);
  if (!match) return path;
  const routes: Record<string, string> = { Track: 'tracks', Entry: 'entries', WorkspaceApp: 'apps' };
  return `/${routes[match[2]]}/${match[1]}${match[3] ?? ''}`;
}

/** Keep current-origin and recognized placeholder record links in the router. */
function internalAppHref(href: string | undefined): string | undefined {
  if (!isSafeHref(href)) return undefined;
  const trimmed = href!.trim();
  const typedRecordPath = /^\/(?:entries\/n\.Entry\.|tracks\/n\.Track\.|apps\/n\.WorkspaceApp\.)[^/\s?#]+$/;
  // Repair model-added double slashes only for typed record paths. Other
  // protocol-relative URLs still refer to external hosts.
  if (trimmed.startsWith('//') && typedRecordPath.test(trimmed.slice(1).split(/[?#]/, 1)[0])) {
    return trimmed.slice(1);
  }
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return typedResourcePath(trimmed);

  try {
    const url = new URL(trimmed, typeof window === 'undefined' ? undefined : window.location.origin);
    if (url.username || url.password) return undefined;
    const localPath = `${url.pathname}${url.search}${url.hash}`;
    if (localPath.startsWith('//')) return undefined;
    if (typeof window !== 'undefined' && url.origin === window.location.origin) {
      return typedResourcePath(localPath);
    }
    // Historical answers used these placeholder hosts. Only known Core record
    // routes can be repaired; unrelated websites and other installations stay
    // external. Never infer authority from a resource ID in a link.
    const placeholderOrigin = ['https://integral.app', 'https://integral.local', 'http://integral.local'].includes(url.origin);
    if (placeholderOrigin && typedRecordPath.test(url.pathname)) return localPath;
    // Preserve compatibility with the public host normalization used by older
    // markdown clients, without accepting credentials or nonstandard ports.
    if (url.origin === 'https://integral.ai') return localPath;
  } catch {
    // Leave malformed/external URLs to the safe external-link renderer.
  }
  return undefined;
}

const linkClassName =
  'text-[var(--link)] hover:text-[var(--link-hover)] underline underline-offset-2 break-all';

export interface IntegralMarkdownLinkProps
  extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  href?: string;
  children?: ReactNode;
}

/**
 * Markdown anchor that uses React Router for in-app paths and opens external
 * URLs in a new tab.
 */
export function IntegralMarkdownLink({
  href,
  children,
  className,
  onClick,
  ...props
}: IntegralMarkdownLinkProps) {
  const safeHref = sanitizeMarkdownHref(href);
  if (!safeHref) {
    return <span className={className} {...props}>{children}</span>;
  }

  const internalHref = internalAppHref(safeHref);
  if (internalHref) {
    return (
      <Link
        to={internalHref}
        className={className ?? linkClassName}
        {...props}
        target={undefined}
        onClick={event => { event.stopPropagation(); onClick?.(event); }}
      >
        {children}
      </Link>
    );
  }

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? linkClassName}
      {...props}
      onClick={event => { event.stopPropagation(); onClick?.(event); }}
    >
      {children}
    </a>
  );
}
