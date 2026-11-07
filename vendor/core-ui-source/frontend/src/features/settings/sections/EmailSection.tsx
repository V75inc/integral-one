import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { workspaceEmailApi, type EmailConfiguration, type RedactedEmailConfiguration } from '../../../api/workspaceEmail';
import { useScopeOptional } from '../../../context/ScopeContext';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Text } from '../../../ui';
import { Field, Section } from '../../../patterns';

const blank: EmailConfiguration = { provider: 'resend', from_email: '', from_name: '', reply_to: '', smtp_host: '', smtp_port: 587, smtp_username: '', smtp_tls: 'starttls' };
const states: Record<string, string> = { queued: 'Queued', dispatching: 'Sending', accepted: 'Accepted', delivered: 'Delivered', delayed: 'Delayed', bounced: 'Bounced', complaint: 'Complaint', failed: 'Failed', unknown: 'Outcome unknown' };
function editable(value: RedactedEmailConfiguration | null): EmailConfiguration {
  if (!value) return { ...blank };
  const { provider, from_email, from_name, reply_to, smtp_host, smtp_port, smtp_username, smtp_tls } = value;
  return { provider, from_email, from_name, reply_to, smtp_host, smtp_port, smtp_username, smtp_tls };
}

export function EmailSection() {
  const scope = useScopeOptional();
  const workspace = scope?.activeWorkspace;
  if (!workspace) return <Text as="p">Select a workspace to configure email.</Text>;
  if (!['owner', 'admin'].includes(workspace.your_role ?? '')) return <Text as="p">Only workspace owners and admins can manage email delivery.</Text>;
  return <EmailWorkspace key={workspace.id} workspaceId={workspace.id} workspaceName={workspace.name} />;
}

function EmailWorkspace({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['workspace-email', workspaceId], queryFn: () => workspaceEmailApi.get(workspaceId) });
  const [form, setForm] = useState<EmailConfiguration>({ ...blank });
  const [dirty, setDirty] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState('');
  const history = useQuery({ queryKey: ['workspace-email-history', workspaceId, cursor], queryFn: () => workspaceEmailApi.history(workspaceId, cursor), refetchInterval: 15000 });
  const settings = query.data;
  useEffect(() => {
    if (settings && !dirty) { setForm(editable(settings.draft)); setFormRevision(settings.revision); }
  }, [settings, dirty]);
  const update = <K extends keyof EmailConfiguration>(key: K, value: EmailConfiguration[K]) => {
    setForm(old => ({ ...old, [key]: value }));
    setDirty(true); setMessage('');
  };
  const action = async (kind: 'save' | 'test' | 'activate' | 'disable') => {
    if (!settings) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (kind === 'save') {
        const saved = await workspaceEmailApi.save(workspaceId, formRevision, form);
        // Drop secrets immediately after the server accepts the draft.
        setForm(editable(saved.draft)); setDirty(false);
        qc.setQueryData(['workspace-email', workspaceId], saved);
        setMessage('Draft saved. Send a test email before activating.');
      } else if (kind === 'test') {
        const result = await (testRecipient.trim() ? workspaceEmailApi.test(workspaceId, settings.revision, testRecipient.trim()) : workspaceEmailApi.test(workspaceId, settings.revision));
        if (result.status === 'accepted') setMessage(result.message);
        else setError(result.message);
      } else {
        const saved = await workspaceEmailApi[kind](workspaceId, settings.revision);
        qc.setQueryData(['workspace-email', workspaceId], saved);
        setMessage(kind === 'activate' ? 'Workspace provider activated.' : 'Workspace now uses platform delivery.');
      }
      await qc.invalidateQueries({ queryKey: ['workspace-email', workspaceId] });
      await qc.invalidateQueries({ queryKey: ['workspace-email-history', workspaceId] });
    } catch (err) {
      const response = err as { response?: { data?: { message?: string } } };
      setError(response.response?.data?.message || 'Could not update email delivery. Reload and try again.');
    } finally { setBusy(false); }
  };
  if (query.isPending) return <Text as="p">Loading email settings…</Text>;
  if (query.isError) return <div role="alert"><Text as="p">Email settings could not be loaded.</Text><Button onClick={() => query.refetch()}>Retry</Button></div>;
  const stored = settings?.draft;
  const unavailable = settings?.available === false;
  const textField = (key: 'from_email' | 'from_name' | 'reply_to' | 'smtp_host' | 'smtp_username', label: string) => <Field label={label} htmlFor={`email-${key}`}><Input id={`email-${key}`} disabled={busy} value={form[key]} onChange={e => update(key, e.target.value)} /></Field>;
  const secretField = (key: 'api_key' | 'smtp_password' | 'webhook_key', label: string, configured: boolean) => <Field label={label} htmlFor={`email-${key}`} hint={configured ? 'A credential is stored. Leave unchanged to keep it, or enter a replacement.' : 'Stored securely on the server.'}><div className="flex gap-2"><Input id={`email-${key}`} type="password" autoComplete="new-password" disabled={busy} value={form[key] ?? ''} onChange={e => update(key, e.target.value)} /><Button variant="secondary" disabled={busy} onClick={() => update(key, '')}>Remove</Button></div>{form[key] === '' && <Text as="p" variant="body-sm">Credential will be removed when you save.</Text>}</Field>;
  return <div className="flex flex-col gap-8">
    <Section title="Workspace email" description={`Configure outbound email for ${workspaceName}. Account recovery and verification use the platform provider.`}>
      <Text as="p">{settings?.mode === 'custom' ? `Active: ${settings.active?.provider} · ${settings.active?.from_email}` : 'Using platform delivery'}</Text>
      {settings?.platform_delivery_configured === false && <Text as="p" variant="body-sm">Platform email is not configured. Set up a workspace provider for workspace messages; your server operator must configure account recovery email separately.</Text>}
      {unavailable && <div role="status"><Text as="p">Native workspace email requires PostgreSQL transactional storage on this server. Platform account email remains available.</Text></div>}
      <Text as="p" variant="body-sm" tone="muted">One provider sends invitations, notifications and App messages. A custom provider failure will appear in delivery history.</Text>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provider" htmlFor="email-provider"><Select id="email-provider" disabled={busy} value={form.provider} onChange={e => { setForm({ ...blank, provider: e.target.value as EmailConfiguration['provider'] }); setDirty(true); setMessage(''); }}><option value="resend">Resend</option><option value="sendgrid">SendGrid</option><option value="smtp">SMTP</option></Select></Field>
        {textField('from_email', 'Sender email')}{textField('from_name', 'Sender name')}{textField('reply_to', 'Reply-to (optional)')}
        {form.provider === 'smtp' ? <>
          {textField('smtp_host', 'SMTP host')}{textField('smtp_username', 'SMTP username')}
          <Field label="SMTP port" htmlFor="email-port"><Select id="email-port" disabled={busy} value={form.smtp_port} onChange={e => { const port = Number(e.target.value) as 465 | 587; update('smtp_port', port); update('smtp_tls', port === 465 ? 'implicit' : 'starttls'); }}><option value={587}>587 — STARTTLS required</option><option value={465}>465 — Implicit TLS</option></Select></Field>
          {secretField('smtp_password', 'SMTP password', stored?.provider === form.provider && !!stored.smtp_password_configured)}
        </> : secretField('api_key', 'API key', stored?.provider === form.provider && !!stored.api_key_configured)}
      </div>
      <Text as="p" variant="body-sm" tone="muted">{form.provider === 'smtp' ? 'Use credentials supplied by your mail service. TLS certificate verification is required. SMTP confirms relay acceptance only.' : 'Verify your sender address or domain with the provider before sending a test.'} {form.provider !== 'smtp' && <a href={form.provider === 'resend' ? 'https://resend.com/docs/dashboard/domains/introduction' : 'https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication'} target="_blank" rel="noreferrer">Sender setup instructions</a>}</Text>
      {form.provider !== 'smtp' && <div className="flex flex-col gap-3">
        <Text as="h3" variant="heading-sm">Delivery tracking (optional)</Text>
        <Text as="p" variant="body-sm">{stored?.tracking_configured ? 'Verification key configured. Waiting for provider events after sending.' : 'Configure signed webhooks to receive delivery, bounce and complaint updates.'}</Text>
        {stored?.webhook_url ? <Field label="Webhook URL" htmlFor="email-webhook-url"><Input id="email-webhook-url" readOnly value={stored.webhook_url} /></Field> : <Text as="p" variant="body-sm">Ask your server operator to enable a public webhook URL for delivery tracking.</Text>}
        {secretField('webhook_key', form.provider === 'resend' ? 'Webhook signing secret' : 'Signed event webhook public key', stored?.provider === form.provider && !!stored.webhook_key_configured)}
        <Text as="p" variant="body-sm"><a href={form.provider === 'resend' ? 'https://resend.com/docs/webhooks/verify-webhooks-requests' : 'https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features'} target="_blank" rel="noreferrer">Webhook setup instructions</a></Text>
      </div>}
      <Field label="Test recipient (optional)" htmlFor="email-test-recipient" hint="Defaults to your account email. Choose another address if needed."><Input id="email-test-recipient" type="email" disabled={busy} value={testRecipient} onChange={e => setTestRecipient(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || unavailable || !dirty} onClick={() => action('save')}>Save draft</Button>
        <Button variant="secondary" disabled={busy || unavailable || dirty || !stored} onClick={() => action('test')}>Send test email</Button>
        <Button disabled={busy || unavailable || dirty || !stored || settings?.tested_revision !== settings?.revision} onClick={() => action('activate')}>Activate</Button>
        {settings?.active && <Button variant="secondary" disabled={busy || unavailable} onClick={() => action('disable')}>Use platform delivery</Button>}
      </div>
      {dirty && <Text as="p" variant="body-sm">Save your changes before testing. Any saved edit requires a new test.</Text>}
      {message && <div role="status"><Text as="p">{message}</Text></div>}
      {error && <div role="alert"><Text as="p">{error}</Text></div>}
    </Section>
    <Section title="Delivery history" description="Provider acceptance is separate from confirmed delivery. Account recovery messages are excluded.">
      {history.isPending ? <Text as="p">Loading delivery history…</Text> : history.isError ? <div role="alert"><Text as="p">Delivery history could not be loaded.</Text><Button onClick={() => history.refetch()}>Retry</Button></div> : !history.data?.items.length ? <Text as="p">No email attempts in this workspace yet.</Text> : <div className="flex flex-col gap-4">{history.data.items.map(item => <article key={item.message_id} className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-3">
        <Text as="h3" variant="body" weight="semibold">{item.subject}</Text>
        <Text as="p" variant="body-sm">{item.to} · {item.provider} · {item.provider === 'smtp' && item.status === 'accepted' ? 'Accepted by mail server' : states[item.status] ?? item.status}</Text>
        <Text as="p" variant="body-sm" tone="muted">{item.source_kind} · {new Date(item.created_at).toLocaleString()}</Text>
        {item.error && <Text as="p" variant="body-sm">{item.error}</Text>}
      </article>)}</div>}
      <div className="flex gap-2"><Button variant="secondary" disabled={!cursor} onClick={() => setCursor('')}>Newest</Button><Button variant="secondary" disabled={!history.data?.next_cursor} onClick={() => setCursor(history.data?.next_cursor ?? '')}>Older</Button></div>
    </Section>
  </div>;
}
