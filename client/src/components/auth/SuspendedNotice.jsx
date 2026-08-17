import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Icon from '../common/Icon';

/**
 * What a suspended account is told, wherever it is met.
 *
 * The sign-in form and the sign-up form both end up here — one because the
 * account cannot be signed into, the other because its address cannot be signed
 * up with — and the sentence has to be the same either way, so it lives once.
 *
 * Unlike a deactivation, there is nothing the person can do about this alone:
 * no link they can mail themselves, no form that lifts it. A staff member has
 * to. Saying only "your account has been suspended" therefore ends the session
 * on a wall; the second line is the door, and it is a real link rather than the
 * usual advice to "contact support" that leaves the reader to find it.
 *
 * `message` is the server's own wording, reason included — the reason is typed
 * by the admin who suspended the account and cannot be translated ahead of
 * time, so it is rendered as given rather than rebuilt from a key here.
 */
export default function SuspendedNotice({ message }) {
  const { t } = useTranslation(['account', 'common']);

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger"
      role="alert"
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p>{message || t('auth.suspended')}</p>
        <p className="mt-1">
          <Trans
            i18nKey="account:auth.suspendedHelp"
            components={{
              contact: <Link to="/contact" className="font-semibold underline" />,
            }}
          />
        </p>
      </div>
    </div>
  );
}
