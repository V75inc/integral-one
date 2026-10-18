import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button, LINE_ICON_STROKE } from '../ui';
import { Input } from '../../ui';
import { authApi } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { errorMessageFromAxios } from '../../api/helpers';
import { Text } from '../../ui';

const MIN_LENGTH = 8;

export function MustChangePasswordModal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = Boolean(user?.must_change_password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      await logout();
      navigate('/login', {
        replace: true,
        state: { passwordUpdated: true },
      });
    } catch (err) {
      setError(errorMessageFromAxios(err, 'Could not update password'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => undefined}
      title="Choose a new password"
      titleIcon={<KeyRound size={16} strokeWidth={LINE_ICON_STROKE} />}
      width="max-w-dialog-confirm"
      variant="compact"
      disableEscape
    >
      <form onSubmit={handleSubmit}>
        <Modal.Body>
          <Text as="p" variant="body" className="leading-relaxed">
            Your account was created with a temporary password. Choose a new one
            to continue.
          </Text>
          <Text
            as="label"
            variant="label"
            htmlFor="mcp-current"
            className="block mt-3"
          >
            Temporary password
          </Text>
          <Input
            id="mcp-current"
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Text
            as="label"
            variant="label"
            htmlFor="mcp-new"
            className="block mt-3"
          >
            New password
          </Text>
          <Input
            id="mcp-new"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Text
            as="label"
            variant="label"
            htmlFor="mcp-confirm"
            className="block mt-3"
          >
            Confirm new password
          </Text>
          <Input
            id="mcp-confirm"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          {error ? (
            <p role="alert" className="text-sm text-[var(--danger-fg)] mt-3">
              {error}
            </p>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="submit"
            loading={submitting}
            disabled={!currentPassword || !newPassword}
          >
            Save password
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
