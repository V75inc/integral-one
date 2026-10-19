import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  AppWindow,
  CheckCircle2,
  Building2,
  Layers3,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AdminOverview } from '../../api/admin';
import { adminApi } from '../../api/admin';
import {
  Button,
  IconWell,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageSection,
  PageShell,
  Skeleton,
} from '../../components/ui';
import { useSetCrumbs } from '../../context/CrumbsContext';
import { adminQueryRecovery } from './adminQueryRecovery';
import { Surface, Text } from '../../ui';

const numberFormat = new Intl.NumberFormat();

function formatCount(value: number): string {
  return numberFormat.format(value);
}

function SummaryCard({
  label,
  value,
  detail,
  href,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  href: string;
  icon: typeof UsersRound;
}) {
  return (
    <Link
      to={href}
      className="group block h-full min-w-0 rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
    >
      <Surface
        as="div"
        tone="panel"
        border="subtle"
        radius="card"
        padding="lg"
        elevation="sm"
        className="h-full transition-transform duration-fast group-hover:-translate-y-0.5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconWell size="sm" variant="brand" className="!text-white" aria-hidden="true">
              <Icon size={17} strokeWidth={LINE_ICON_STROKE} />
            </IconWell>
            <Text as="span" variant="label" tone="subtle" className="truncate">
              {label}
            </Text>
          </div>
          <ArrowUpRight
            size={16}
            strokeWidth={LINE_ICON_STROKE}
            aria-hidden="true"
            className="shrink-0 opacity-60 transition-transform duration-fast group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent)]"
          />
        </div>
        <div className="mt-6">
          <Text as="p" variant="display-md" tone="default" weight="semibold">
            {formatCount(value)}
          </Text>
          <div className="mt-1">
            <Text as="p" variant="body-sm" tone="subtle">
              {detail}
            </Text>
          </div>
        </div>
      </Surface>
    </Link>
  );
}

function ProportionBar({ first, second }: { first: number; second: number }) {
  const total = first + second;
  const firstPercent = total > 0 ? (first / total) * 100 : 0;
  const secondPercent = total > 0 ? (second / total) * 100 : 0;

  return (
    <Surface tone="panel-2" radius="pill"
      className="flex h-2 overflow-hidden"
      role="img"
      aria-label={`${formatCount(first)} and ${formatCount(second)}; ${formatCount(total)} total`}
    >
      <span
        className="h-full rounded-l-full bg-[var(--brand-accent)] transition-[width] duration-500"
        style={{ width: `${firstPercent}%` }}
      />
      <span
        className="h-full bg-[var(--text-muted)] opacity-35 transition-[width] duration-500"
        style={{ width: `${secondPercent}%` }}
      />
    </Surface>
  );
}

function BreakdownLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden="true" className="shrink-0 opacity-60" />
        <Text as="span" variant="body-sm" tone="subtle" className="truncate">
          {label}
        </Text>
      </div>
      <Text as="span" variant="body" tone="default" weight="semibold">
        {formatCount(value)}
      </Text>
    </div>
  );
}

function MixPanel({
  title,
  description,
  firstLabel,
  secondLabel,
  first,
  second,
  icon: Icon,
  href,
}: {
  title: string;
  description: string;
  firstLabel: string;
  secondLabel: string;
  first: number;
  second: number;
  icon: typeof ShieldCheck;
  href: string;
}) {
  return (
    <Surface as="section" aria-label={title} tone="panel" border="subtle" radius="card" padding="lg" className="min-w-0">
      <div className="flex items-start gap-3">
        <IconWell size="sm" aria-hidden="true">
          <Icon size={17} strokeWidth={LINE_ICON_STROKE} />
        </IconWell>
        <div className="min-w-0 flex-1">
          <Text as="h2" variant="heading-sm" tone="default" weight="semibold">
            {title}
          </Text>
          <div className="mt-1">
            <Text as="p" variant="body-sm" tone="subtle">
              {description}
            </Text>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <ProportionBar first={first} second={second} />
        <div className="mt-5 space-y-3">
          <BreakdownLine icon={CheckCircle2} label={firstLabel} value={first} />
          <BreakdownLine icon={XCircle} label={secondLabel} value={second} />
        </div>
      </div>

      <Link
        to={href}
        className="mt-6 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-[var(--link)] transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
      >
        Open directory
        <ArrowUpRight size={15} strokeWidth={LINE_ICON_STROKE} aria-hidden="true" />
      </Link>
    </Surface>
  );
}

function OverviewLoading() {
  return (
    <div className="space-y-5" aria-label="Loading platform overview" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-[var(--radius-card)]" />
        <Skeleton className="h-64 rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}

function OverviewContent({ data }: { data: AdminOverview }) {
  const activeAccounts = data.active_users;
  const inactiveAccounts = data.inactive_users;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <SummaryCard
          label="People"
          value={data.total_users}
          detail={`${formatCount(activeAccounts)} active accounts`}
          href="/admin/users"
          icon={UsersRound}
        />
        <SummaryCard
          label="Workspaces"
          value={data.personal_workspaces + data.organization_workspaces}
          detail={`${formatCount(data.organization_workspaces)} organization workspaces`}
          href="/admin/workspaces"
          icon={Building2}
        />
        <SummaryCard
          label="Apps"
          value={data.total_apps}
          detail="Apps across the platform"
          href="/admin/apps"
          icon={AppWindow}
        />
        <SummaryCard
          label="Tracks"
          value={data.total_tracks}
          detail="Tracks across the platform"
          href="/admin/tracks"
          icon={Layers3}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MixPanel
          title="Account access"
          description="Account status and platform-level authority."
          firstLabel="Active accounts"
          secondLabel="Inactive accounts"
          first={activeAccounts}
          second={inactiveAccounts}
          icon={ShieldCheck}
          href="/admin/users"
        />
        <MixPanel
          title="Workspace structure"
          description="How work is organized across personal and shared spaces."
          firstLabel="Personal workspaces"
          secondLabel="Organization workspaces"
          first={data.personal_workspaces}
          second={data.organization_workspaces}
          icon={Building2}
          href="/admin/workspaces"
        />
      </div>

      <Surface as="section" aria-label="Platform administration" tone="panel-2" border="subtle" radius="card" padding="lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <IconWell size="sm" variant="brand" className="!text-white" aria-hidden="true">
              <ShieldCheck size={17} strokeWidth={LINE_ICON_STROKE} />
            </IconWell>
            <div className="min-w-0">
              <Text as="h2" variant="heading-sm" tone="default" weight="semibold">
                Platform governance
              </Text>
              <div className="mt-1">
                <Text as="p" variant="body-sm" tone="subtle">
                  {formatCount(data.platform_admins)} platform administrators can manage access and shared resources.
                </Text>
              </div>
            </div>
          </div>
          <Link
            to="/admin/users"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm text-sm font-medium text-[var(--link)] transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
          >
            Review user access
            <ArrowUpRight size={15} strokeWidth={LINE_ICON_STROKE} aria-hidden="true" />
          </Link>
        </div>
      </Surface>
    </div>
  );
}

export function AdminOverviewPage() {
  useSetCrumbs([{ label: 'Admin', to: '/admin' }, { label: 'Overview' }]);

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => adminApi.getOverview(),
    ...adminQueryRecovery,
  });

  return (
    <PageShell>
      <PageSection>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-accent)]" aria-hidden="true" />
              <Text as="span" variant="label" tone="subtle">
                Platform administration
              </Text>
            </div>
            <PageHeading>Platform overview</PageHeading>
            <div className="mt-2">
              <PageMeta as="p">
                A clear view of the people, workspaces, and resources across Integral.
              </PageMeta>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            icon={<RefreshCw size={15} strokeWidth={LINE_ICON_STROKE} className={isFetching ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
        </div>
      </PageSection>

      <PageSection className="mt-8">
        {isPending ? (
          <OverviewLoading />
        ) : error && !data ? (
          <Surface
            as="div"
            role="alert"
            tone="panel"
            border="default"
            radius="card"
            padding="lg"
            className="flex flex-col gap-4 border-[var(--danger-border)] bg-transparent sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <Text as="p" variant="heading-sm" tone="default" weight="semibold" className="!text-[var(--danger-text)]">
                Platform overview is unavailable
              </Text>
              <div className="mt-1">
                <Text as="p" variant="body-sm" tone="subtle" className="!text-[var(--danger-text)]">
                  The platform totals could not be retrieved. Retry to check the connection.
                </Text>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="border-[var(--danger-border)] text-[var(--danger-text)] hover:bg-[var(--danger-bg)]">
              Try again
            </Button>
          </Surface>
        ) : data ? (
          <OverviewContent data={data} />
        ) : null}
      </PageSection>
    </PageShell>
  );
}
