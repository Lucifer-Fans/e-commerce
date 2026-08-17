const ApiError = require('./ApiError');

/**
 * The rejection a blocked account gets, wherever it tries to get in. The reason the
 * admin typed when blocking is appended so the person knows why rather than only
 * that — accounts blocked before the field existed simply carry no reason and fall
 * back to the bare sentence.
 *
 * Tagged, because a suspension is the one closed state with nothing the account
 * holder can do on their own: there is no reactivation link to mail themselves,
 * only a person to ask. The code is what lets both front-ends render that ask —
 * a link to contact us — instead of leaving a dead end on the screen.
 */
function suspendedError(user) {
  const reason = user?.blockedReason?.trim();
  return ApiError.forbidden(
    reason
      ? `Your account has been suspended due to ${reason}`
      : 'Your account has been suspended',
    'ACCOUNT_SUSPENDED'
  );
}

/**
 * The rejection a self-deactivated account gets.
 *
 * Worded as a signpost rather than a refusal, and tagged so the front-ends can
 * render the one thing there is to do about it — ask us to email a reactivation
 * link — as a button instead of leaving the reader to work out that "contact
 * support" is the next step. The address is not repeated in the sentence: the
 * person typed it into the form they are looking at.
 */
function deactivatedError(user) {
  const error = ApiError.forbidden('Your account has been deactivated.', 'ACCOUNT_DEACTIVATED');
  /**
   * The address rides along so the screen can offer to mail a link to it without
   * asking for it again. It is not a leak: every caller that reaches this has
   * already presented a correct password or a Google identity for this very
   * account, so the address is something they have just proven they hold.
   *
   * It matters most on the Google door, which is the one place the front-end has
   * no address of its own — the shopper typed nothing, they pressed a button.
   */
  if (user?.email) error.details = { email: user.email };
  return error;
}

/**
 * The rejection an account gets while its reactivation request is with an admin.
 *
 * Deliberately distinct from the one above: someone who has already submitted a
 * request and is told only "your account is deactivated" will submit it again,
 * and again — the queue fills with duplicates from one person waiting for news.
 */
function reactivationPendingError(user) {
  const error = ApiError.forbidden(
    'Your reactivation request is being reviewed. Your account will be activated within ' +
      '2-3 working days, and we will email you as soon as it is.',
    'REACTIVATION_PENDING'
  );
  if (user?.email) error.details = { email: user.email };
  return error;
}

/**
 * The one gate every way in runs, so no door can quietly forget one of the states
 * the others refuse. Returns the error to throw, or null when the account is fine.
 *
 * Callers throw rather than being handed a thrown error, because several of them
 * want to record the refusal in the audit trail on the way past.
 */
function inactiveAccountError(user) {
  switch (user?.status) {
    case 'blocked':
      return suspendedError(user);
    case 'deactivated':
      return deactivatedError(user);
    case 'reactivation-pending':
      return reactivationPendingError(user);
    default:
      return null;
  }
}

/** Whether the owner closed this account — either state of that one story. */
const isSelfDeactivated = (user) =>
  user?.status === 'deactivated' || user?.status === 'reactivation-pending';

module.exports = {
  suspendedError,
  deactivatedError,
  reactivationPendingError,
  inactiveAccountError,
  isSelfDeactivated,
};
