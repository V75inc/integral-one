import type { ReactNode } from 'react';
import { Stack, Surface, Text } from '../../ui';
import { Logo } from './Logo';
import { INTEGRAL_LOGO_HALF_PATH } from '../../brandLogo';

export const AUTH_FIELD_INPUT_CLASSES = 'auth-field-input';

export const AUTH_FIELD_LABEL_CLASSES = 'auth-field-label';

export function AuthPanelHeading({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <h2 id={id} className="auth-panel-heading">
      <span className="auth-panel-heading__marker" aria-hidden="true" />
      <Text variant="display-sm" as="span">
        {children}
      </Text>
    </h2>
  );
}

interface AuthPageLayoutProps {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  compact?: boolean;
}

export function AuthPageLayout({
  title,
  description,
  children,
  compact = false,
}: AuthPageLayoutProps) {
  if (compact) return (
    <main className="auth-page auth-page--compact">
      <section className="auth-compact-content" aria-label="Account access">
        <div className="auth-compact-brand"><Logo size="md" /></div>
        {children}
      </section>
    </main>
  );
  return (
    <main className="auth-page relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[var(--section-bg)] px-5 py-10 sm:px-8">
      <div className="auth-content-grid relative z-10 grid w-full max-w-[1120px] items-center gap-8 md:grid-cols-2 lg:gap-12">
        <section className="auth-hero relative flex w-full flex-col items-center justify-center py-8 text-center md:py-0">
          <span className="auth-pattern" aria-hidden="true">
            <svg
              className="auth-ripple auth-ripple--auth"
              viewBox="58 58 604 604"
              aria-hidden="true"
            >
              <g className="auth-ripple-mark">
                <path d={INTEGRAL_LOGO_HALF_PATH} transform="translate(0 -32)" />
                <path d={INTEGRAL_LOGO_HALF_PATH} transform="translate(0 32) rotate(180 360 360)" />
              </g>
            </svg>
          </span>
          <Stack gap="lg" align="center" className="auth-hero-copy w-full max-w-[620px]">
            <Text variant="display-md" as="h1" className="text-center">
              {title}
            </Text>
            <Text variant="body-lg" tone="muted" as="p" className="max-w-[560px] text-center">
              {description}
            </Text>
          </Stack>
        </section>

        <Surface
          as="section"
          tone="panel"
          border="default"
          radius="card"
          elevation="pop"
          className="w-full max-w-[440px] justify-self-center"
        >
          <div className="px-6 py-7 sm:px-9 sm:py-9">
          <div className="mb-7 flex justify-center">
            <Logo to="/" size="lg" />
          </div>
          {children}
          </div>
        </Surface>
      </div>
    </main>
  );
}
