import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui';
import { LINE_ICON_STROKE } from '../../components/ui/IconWell';
import { Text } from '../../ui';
import { useAuth } from '../../context/AuthContext';
import {
  isMemberAssignedFormPathname,
  pendingAssignedFormUrl,
  resolveMemberAssignedFormNavigateTarget,
} from './memberAssignedFormRoutes';

/**
 * Shown when the server sets `pending_assigned_form` on the user (any app
 * that assigns a member form). Blocks the shell until the form is submitted.
 */
export function MemberAssignedFormPromptModal() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const rawUrl = pendingAssignedFormUrl(user);
  const formPath = useMemo(
    () => resolveMemberAssignedFormNavigateTarget(rawUrl),
    [rawUrl],
  );

  const open = useMemo(
    () =>
      Boolean(rawUrl) &&
      !user?.must_change_password &&
      !isMemberAssignedFormPathname(location.pathname),
    [rawUrl, user?.must_change_password, location.pathname],
  );

  useEffect(() => {
    if (!open) return;
    const onFocus = () => {
      void refreshUser();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [open, refreshUser]);

  const handleOpenForm = () => {
    navigate(formPath);
  };

  return (
    <Modal
      open={open}
      onClose={() => undefined}
      title="Complete your assigned form"
      titleIcon={<ClipboardCheck size={16} strokeWidth={LINE_ICON_STROKE} />}
      width="max-w-dialog-confirm"
      variant="compact"
      disableEscape
    >
      <Modal.Body>
        <Text as="p" variant="body" className="leading-relaxed">
          Your workspace assigned you a form to complete. Fill in the required
          details and submit — this prompt stays until the form is submitted.
        </Text>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" onClick={handleOpenForm}>
          Open form
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
