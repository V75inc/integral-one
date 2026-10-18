/**
 * Host UI extension slots. Open-source Core leaves these empty;
 * a host image may overlay `host/register.tsx` (and sibling host modules)
 * at image build to fill them.
 *
 * Plan/paywall presentation is not a Core concern — hosts map generic
 * entitlement denials (and other resource denials) to upgrade prompts.
 */
import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type SettingsSectionRegistration = {
  id: string;
  label: string;
  icon: LucideIcon;
  render: () => ReactNode;
};

export type AdminNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

export type AdminRouteRegistration = {
  path: string;
  element: ReactNode;
};

export type SidebarAccountAction = {
  id: string;
  /** Static fallback shown before a dynamic Label mounts. */
  label: string;
  /** Optional live label (e.g. Upgrade plan vs Manage plan). */
  Label?: ComponentType;
  /** Optional host-supplied icon; Core uses a neutral fallback when unset. */
  icon?: LucideIcon;
  onSelect: () => void;
  /** Optional test id for the menu item (host-owned; Core does not special-case ids). */
  testId?: string;
};

/** Optional host mapping from an API error or a structured batch failure row to a CTA. */
export type InstallDenialAction = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export type InstallDenialResolver = (err: unknown) => InstallDenialAction | null;

type LayoutBanner = ComponentType;

const settingsSections: SettingsSectionRegistration[] = [];
const adminNav: AdminNavItem[] = [];
const adminRoutes: AdminRouteRegistration[] = [];
const sidebarActions: SidebarAccountAction[] = [];
const layoutBanners: LayoutBanner[] = [];
let composerAccessory: ComponentType<{ workspaceId: string }> | null = null;
let installDenialResolver: InstallDenialResolver | null = null;

export function registerSettingsSection(section: SettingsSectionRegistration): void {
  const i = settingsSections.findIndex(s => s.id === section.id);
  if (i >= 0) settingsSections[i] = section;
  else settingsSections.push(section);
}

export function getRegisteredSettingsSections(): SettingsSectionRegistration[] {
  return [...settingsSections];
}

export function registerAdminNavItem(item: AdminNavItem): void {
  const i = adminNav.findIndex(n => n.to === item.to);
  if (i >= 0) adminNav[i] = item;
  else adminNav.push(item);
}

export function getRegisteredAdminNav(): AdminNavItem[] {
  return [...adminNav];
}

export function registerAdminRoute(route: AdminRouteRegistration): void {
  const i = adminRoutes.findIndex(r => r.path === route.path);
  if (i >= 0) adminRoutes[i] = route;
  else adminRoutes.push(route);
}

export function getRegisteredAdminRoutes(): AdminRouteRegistration[] {
  return [...adminRoutes];
}

export function registerSidebarAccountAction(action: SidebarAccountAction): void {
  const i = sidebarActions.findIndex(a => a.id === action.id);
  if (i >= 0) sidebarActions[i] = action;
  else sidebarActions.push(action);
}

export function getRegisteredSidebarAccountActions(): SidebarAccountAction[] {
  return [...sidebarActions];
}

export function registerLayoutBanner(Banner: LayoutBanner): void {
  if (!layoutBanners.includes(Banner)) layoutBanners.push(Banner);
}

export function getRegisteredLayoutBanners(): LayoutBanner[] {
  return [...layoutBanners];
}

/** Composer accessory slot (host may show usage hints, etc.). */
export function registerComposerAccessory(
  Comp: ComponentType<{ workspaceId: string }> | null,
): void {
  composerAccessory = Comp;
}

export function getComposerAccessory(): ComponentType<{
  workspaceId: string;
}> | null {
  return composerAccessory;
}

export function registerInstallDenialResolver(
  fn: InstallDenialResolver | null,
): void {
  installDenialResolver = fn;
}

export function resolveInstallDenial(err: unknown): InstallDenialAction | null {
  if (!installDenialResolver) return null;
  try {
    return installDenialResolver(err);
  } catch {
    return null;
  }
}
