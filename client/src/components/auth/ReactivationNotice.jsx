import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { reactivationApi } from '../../api/endpoints';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';

/**
 * What a deactivated account is told, wherever it is met.
 *
 * The sign-in form and the sign-up form both end up here — one because the
 * account cannot be signed into, the other because its address cannot be signed
 * up with — and both were previously dead ends: a refusal, and no way out of it
 * short of writing to support. The refusal is the same either way, so the panel
 * that carries it and the one button that resolves it live in one place.
 *
 * The button is the whole point. "Contact support to reactivate" is a sentence
 * that ends a session; a link that mails the account holder a way back is one
 * that continues it, and it is safe to offer to anyone because the link only
 * ever goes to the registered address.
 *
 * `pending` switches the copy for an account whose request is already with an
 * admin. There is nothing to send in that case, so the button is not offered —
 * a second link would only produce a duplicate request from someone who is
 * already waiting.
 */
export default function ReactivationNotice({ email, message, pending = false }) {
  const { t } = useTranslation(['account', 'common']);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const res = await reactivationApi.request(email);

      // A request already under review answers with its own wording rather than
      // the generic "check your inbox" — there is no new email to check for.
      if (res.data?.pending) {
        toast.success(res.message);
      } else {
        setSent(true);
        toast.success(t('reactivate.linkSent'));
      }

      // Dev convenience, exactly as forgot-password surfaces its link: without
      // SMTP wired up there is otherwise no way to reach the next screen locally.
      if (res.data?.devReactivateUrl) {
        // eslint-disable-next-line no-console
        console.info('Reactivation link:', res.data.devReactivateUrl);
      }
    } catch (err) {
      toast.error(err.message || t('reactivate.linkFailed'));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div
        className="flex items-start gap-2.5 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800"
        role="status"
      >
        <Icon name="mail" size={16} className="mt-0.5 shrink-0" />
        <p>{t('reactivate.checkInbox', { email })}</p>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800"
      role="alert"
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p>{message || t('reactivate.deactivated')}</p>

        {!pending && (
          <button
            type="button"
            onClick={send}
            disabled={sending || !email}
            className="mt-1 inline-flex items-center gap-1.5 font-semibold underline
                       disabled:no-underline disabled:opacity-60"
          >
            {sending && <Spinner size={13} />}
            {t('reactivate.sendLink')}
          </button>
        )}
      </div>
    </div>
  );
}
