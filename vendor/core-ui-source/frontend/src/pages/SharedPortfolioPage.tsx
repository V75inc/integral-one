import { PageMeta } from '../components/ui';
/**
 * Phase 21 PF-03 — Public-facing portfolio share surface.
 *
 * Renders a single Case Study read-only from
 * ``GET /api/portfolio/shared/:token``. No authentication is required —
 * the page is reachable without a session. Privileged data (cost,
 * margin, contract, payroll) is STRUCTURALLY ABSENT from the API
 * payload by design (PF-05); this page only displays whitelisted
 * fields the backend returns.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface SharedCaseStudy {
  title: string;
  body: string;
  client_name: string;
  sector: string;
  problem: string;
  approach: string;
  outcome: string;
  tech_stack: string[];
  engagement_size: string;
}

interface SharedPortfolioResponse {
  case_study: SharedCaseStudy;
  shared_at: string;
}

function getApiBase(): string {
  // Mirror the api/client baseURL resolution but without auth injection.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const base = env?.VITE_BACKEND_URL || '';
  if (base) return base.replace(/\/$/, '');
  // Default to relative — Vite dev proxy forwards /api to backend.
  return '';
}

export function SharedPortfolioPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Direct fetch — no JWT, no axios interceptors. The endpoint
        // is auth=False; including a stale Bearer header would be
        // ignored by the server but might trigger a refresh-token
        // round-trip in the shared axios client.
        const resp = await fetch(
          `${getApiBase()}/api/portfolio/shared/${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        if (resp.status === 200) {
          setData((await resp.json()) as SharedPortfolioResponse);
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <main
        data-testid="shared-portfolio-loading"
        className="mx-auto max-w-3xl px-6 py-16 text-sm text-fg-muted"
      >
        Loading…
      </main>
    );
  }

  if (notFound || !data) {
    return (
      <main
        data-testid="shared-portfolio-not-found"
        className="mx-auto max-w-3xl px-6 py-16"
      >
        <h1 className="text-2xl font-semibold">Not available</h1>
        <p className="mt-4 text-fg-muted">
          This portfolio link is invalid, has expired, or has been revoked.
        </p>
      </main>
    );
  }

  const cs = data.case_study;
  return (
    <main
      data-testid="shared-portfolio-page"
      className="mx-auto max-w-3xl px-6 py-12"
    >
      <header className="mb-8 border-b border-border-default pb-6">
        <p className="text-xs uppercase tracking-wide text-fg-muted">
          Case study
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{cs.title}</h1>
        <PageMeta as="p" data-testid="shared-portfolio-client">
          {cs.client_name}
          {cs.sector ? ` · ${cs.sector}` : ''}
          {cs.engagement_size ? ` · ${cs.engagement_size}` : ''}
        </PageMeta>
      </header>

      {cs.body ? (
        <section className="prose prose-sm mb-8" data-testid="shared-portfolio-body">
          {cs.body}
        </section>
      ) : null}

      {cs.problem ? (
        <section className="mb-6" data-testid="shared-portfolio-problem">
          <h2 className="mb-2 text-lg font-semibold">Problem</h2>
          <div className="whitespace-pre-line">{cs.problem}</div>
        </section>
      ) : null}

      {cs.approach ? (
        <section className="mb-6" data-testid="shared-portfolio-approach">
          <h2 className="mb-2 text-lg font-semibold">Approach</h2>
          <div className="whitespace-pre-line">{cs.approach}</div>
        </section>
      ) : null}

      {cs.outcome ? (
        <section className="mb-6" data-testid="shared-portfolio-outcome">
          <h2 className="mb-2 text-lg font-semibold">Outcome</h2>
          <div className="whitespace-pre-line">{cs.outcome}</div>
        </section>
      ) : null}

      {cs.tech_stack && cs.tech_stack.length > 0 ? (
        <section
          className="mt-8 border-t border-border-default pt-6"
          data-testid="shared-portfolio-tech-stack"
        >
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Stack
          </h2>
          <ul className="flex flex-wrap gap-2">
            {cs.tech_stack.map((t) => (
              <li
                key={t}
                className="rounded-full border border-border-default px-3 py-1 text-xs"
              >
                {t}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
