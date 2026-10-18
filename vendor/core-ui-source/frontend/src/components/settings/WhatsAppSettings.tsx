import { useState, useEffect, useCallback } from 'react';
import { Phone, Link2, CheckCircle2, XCircle, Loader2, Send, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAgentive } from '../../context/AgentiveContext';
import {
  listChannelIdentities,
  unlinkChannelIdentity,
  initiateWhatsAppVerification,
  verifyWhatsAppOtp
} from '../../api/agentive';
import { Button, IconWell, LINE_ICON_STROKE } from '../ui';
import { Text } from '../../ui';

interface ChannelIdentity {
  id: string;
  channel: string;
  channel_user_id: string;
  verified: boolean;
  verified_at?: string;
  preferences?: Record<string, unknown>;
  created_at?: string;
}

export function WhatsAppSettings({ onChange }: { onChange?: () => void } = {}) {
  const { showToast } = useToast();
  const { enabled } = useAgentive();
  const [identities, setIdentities] = useState<ChannelIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'idle' | 'enter_phone' | 'enter_otp'>('idle');
  const [, setPendingIdentityId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadIdentities = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      const res = await listChannelIdentities();
      setIdentities(res.identities || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { loadIdentities(); }, [loadIdentities]);

  const handleInitiate = async () => {
    if (!phone.trim()) { showToast('Enter your WhatsApp phone number', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await initiateWhatsAppVerification(phone.trim());
      if (res.identity_id || res.otp_code) {
        setPendingIdentityId(res.identity_id || '');
        if (res.verified) {
          showToast('WhatsApp number already linked!', 'success');
          await loadIdentities();
          onChange?.();
          setStep('idle');
          setPhone('');
        } else {
          setStep('enter_otp');
          showToast(res.otp_code
            ? `Verification code: ${res.otp_code} (send this to the agent on WhatsApp)`
            : 'Check your WhatsApp for a verification code',
          'info');
        }
      } else if (res.error) {
        showToast(res.error, 'error');
      }
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Failed to initiate verification', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) { showToast('Enter the verification code', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await verifyWhatsAppOtp(phone.trim(), otpCode.trim());
      if (res.verified) {
        showToast('WhatsApp number verified!', 'success');
        await loadIdentities();
        onChange?.();
        setStep('idle');
        setPhone('');
        setOtpCode('');
      } else {
        showToast(res.message || 'Invalid code, try again', 'error');
      }
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Verification failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlink = async (id: string) => {
    try {
      await unlinkChannelIdentity(id);
      showToast('WhatsApp number unlinked', 'success');
      await loadIdentities();
      onChange?.();
    } catch {
      showToast('Failed to unlink', 'error');
    }
  };

  const whatsappIdentities = identities.filter((i) => i.channel === 'whatsapp');

  if (!enabled) {
    return (
      <div className="app-card p-5">
        <h2 className="font-display text-xl font-bold text-[var(--text)] flex items-center gap-2 mb-3">
          <Phone size={20} strokeWidth={LINE_ICON_STROKE} />
          WhatsApp
        </h2>
        <Text variant="body" tone="muted" as="p">
          WhatsApp is unavailable. Contact your administrator to check channel configuration.
        </Text>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app-card p-5 flex items-center gap-3">
        <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
        <span className="text-sm text-[var(--text-muted)]">Loading...</span>
      </div>
    );
  }

  if (loadError) return <div role="alert" className="app-card p-5"><Text as="p" variant="body-sm" tone="danger">Could not load WhatsApp numbers.</Text><Button variant="outline" size="sm" onClick={() => void loadIdentities()}>Try again</Button></div>;

  return (
    <div className="app-card p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <IconWell size="sm" aria-hidden>
          <Phone size={16} strokeWidth={LINE_ICON_STROKE} />
        </IconWell>
        WhatsApp
      </h3>

      <p className="text-sm text-[var(--text-muted)] mb-4">
        Link your WhatsApp number to interact with Integral via WhatsApp messages.
        You'll be able to create entries, query tracks, and manage your workspace from any WhatsApp chat.
      </p>

      {/* Linked numbers */}
      {whatsappIdentities.length > 0 && (
        <div className="space-y-2 mb-4">
          <h3 className="text-sm font-medium text-[var(--text)]">Linked numbers</h3>
          {whatsappIdentities.map((ci) => (
            <div
              key={ci.id}
              className="flex items-center justify-between bg-[var(--panel-2)] rounded-[var(--radius-input)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-[var(--text-muted)]" />
                <span className="text-sm font-mono">{ci.channel_user_id}</span>
                {ci.verified ? (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--success-fg)]">
                    <CheckCircle2 size={12} /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--warn-fg)]">
                    <XCircle size={12} /> Unverified
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} strokeWidth={LINE_ICON_STROKE} />}
                onClick={() => handleUnlink(ci.id)}
              >
                Unlink
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new number */}
      {step === 'idle' && (
        <Button
          variant="outline"
          size="sm"
          icon={<Link2 size={13} strokeWidth={LINE_ICON_STROKE} />}
          onClick={() => { setStep('enter_phone'); setPhone(''); }}
        >
          Link WhatsApp number
        </Button>
      )}

      {step === 'enter_phone' && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-[var(--text)]">WhatsApp phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              className="mt-1 block w-full rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleInitiate} loading={submitting}>
              Send verification code
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setPhone(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 'enter_otp' && (
        <div className="space-y-3">
          <Text variant="body" tone="muted" as="p">
            A verification code has been generated. Send it to the Integral agent on WhatsApp, or enter it below.
          </Text>
          <label className="block">
            <span className="text-sm font-medium text-[var(--text)]">Verification code</span>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="mt-1 block w-full rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] font-mono tracking-widest text-center"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleVerifyOtp} loading={submitting} icon={<Send size={13} strokeWidth={LINE_ICON_STROKE} />}>
              Verify
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStep('enter_phone'); setOtpCode(''); }}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}