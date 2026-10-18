/**
 * TopBar — the application's top chrome row.
 *
 * Reference design (Quiet Premium dark):
 *   - Breadcrumbs on the left ("Acme Inc. › Product › Roadmap")
 *   - Right side: ⌘K text hint (no chip, no border) + circular avatar
 *   - No background, no border-bottom — sits on the page surface, the
 *     content's whitespace alone defines the row
 *
 * Mobile: also exposes the menu toggle that opens the sidebar drawer.
 */

import { Link, useLocation } from 'react-router-dom';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { LINE_ICON_STROKE } from '../ui';
import { NotificationsHeaderButton } from './NotificationsHeaderButton';
import { isAssistantFullPagePath } from '../../context/AssistantDockContext';
import { AssistantViewTabs } from '../../features/ai-chat/inbox/AssistantViewTabs';
import { useTheme } from '../../context/ThemeContext';
import type { Crumb } from '../ui';

interface TopBarProps {
  crumbs: Crumb[];
  isDesktop: boolean;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
}

export function TopBar({
  crumbs,
  isDesktop: _isDesktop,
  mobileNavOpen,
  onToggleMobileNav,
}: TopBarProps) {
  void _isDesktop;
  const last = crumbs.length - 1;
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const themeLabel = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;

  return (
    <header
      /* `pointer-events-none` on the bar, `auto` on each cluster inside it.
         The bar is an absolutely-positioned transparent overlay spanning the
         whole main column, so with a single `pointer-events-auto` wrapper (as
         Layout used to apply) its EMPTY middle still swallowed clicks — the
         top ~58px of whatever the page put underneath was dead. On `/agent`
         that is the conversation rail: the agent-switcher row sat right on the
         boundary and its upper half was unclickable.
         Layout's comment already claimed "empty middle is click-through";
         this makes that true instead of aspirational. */
      className="
        pointer-events-none
        flex items-center gap-1.5 md:gap-3
        pt-[18px] md:pt-[22px] px-3 md:px-14 pb-0
        text-[15px]
        bg-transparent
      "
    >
      {/* Mobile drawer toggle — sm/xs only. Sits inline before the
          breadcrumbs so the row stays a single beat. */}
      <button
        type="button"
        className="
          pointer-events-auto
          md:hidden shrink-0 inline-flex items-center justify-center
          w-10 h-10 -ml-1 mr-1 rounded-md
          text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]
          transition-colors duration-fast
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
        "
        aria-expanded={mobileNavOpen}
        aria-controls="app-sidebar-nav"
        aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
        onClick={onToggleMobileNav}
      >
        {mobileNavOpen ? (
          <X size={18} strokeWidth={LINE_ICON_STROKE} />
        ) : (
          <Menu size={18} strokeWidth={LINE_ICON_STROKE} />
        )}
      </button>

      {/* Breadcrumbs — gap-2 between segments, last segment ink-100. */}
      <nav
        aria-label="Breadcrumb"
        /* The nav is `flex-1` — it spans the whole empty middle. Keeping it
           click-through and re-enabling pointer events per crumb is what lets
           a page own the space under an empty breadcrumb trail. */
        className="
          pointer-events-none
          flex items-center gap-2 min-w-0 flex-1
          overflow-x-auto overflow-y-hidden
          [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          text-[var(--text-subtle)]
        "
      >
        {crumbs.map((c, i) => {
          const isLast = i === last;
          return (
            <span
              key={`${c.label}-${i}`}
              className="pointer-events-auto flex items-center gap-2 shrink-0"
            >
              {i > 0 && (
                <span aria-hidden className="select-none">›</span>
              )}
              {c.to && !isLast ? (
                <Link
                  to={c.to}
                  className="hover:text-[var(--text-muted)] whitespace-nowrap transition-colors duration-fast"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={[
                    'whitespace-nowrap',
                    isLast ? 'text-[var(--text)]' : '',
                  ].join(' ')}
                >
                  {c.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {/* Right cluster — theme toggle + notifications. Avatar lives in
          the sidebar's footer, so we don't duplicate it here. The ⌘K hint
          is intentionally absent — the spec keeps the top row quiet. */}
      <div className="pointer-events-auto flex items-center gap-1 md:gap-2 shrink-0">
        {/* On the full-page assistant only: the Chat/Inbox switch joins this
            cluster. It is the assistant's own navigation, and the top bar is
            where this layout already puts controls that act on the whole
            surface. Every other route renders nothing here. */}
        {isAssistantFullPagePath(pathname) ? (
          <AssistantViewTabs variant="chrome" />
        ) : null}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={themeLabel}
          title={themeLabel}
          className="shrink-0 inline-flex items-center justify-center w-10 h-10 md:w-9 md:h-9 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-2)] text-[var(--text)] hover:bg-[var(--panel)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
        >
          {theme === 'dark' ? (
            <Sun
              size={18}
              strokeWidth={LINE_ICON_STROKE}
              className="text-[var(--text-muted)]"
              aria-hidden
            />
          ) : (
            <Moon
              size={18}
              strokeWidth={LINE_ICON_STROKE}
              className="text-[var(--text-muted)]"
              aria-hidden
            />
          )}
        </button>
        <NotificationsHeaderButton />
      </div>
    </header>
  );
}
