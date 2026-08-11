import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GOOGLE_CLIENT_ID } from '../../utils/constants';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/* One shared load promise — several auth screens can mount without racing. */
let gisPromise = null;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      let script = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      const fail = () => {
        gisPromise = null; // let a later mount retry
        reject(new Error('Google sign-in could not be loaded'));
      };
      if (!script) {
        script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', resolve);
      script.addEventListener('error', fail);
    });
  }
  return gisPromise;
}

/* Google's four-colour "G", inlined so the button paints in one go. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * "Continue with Google" button.
 *
 * The visible button is ours so it matches `.btn-outline` and the submit button
 * above it — same width, height, radius, type scale and focus ring. Google's
 * own button is still rendered on top at zero opacity — GIS lives in a cross-origin
 * iframe that can't be clicked programmatically, so the real one has to receive the
 * click. That also keeps Google's accessible name and keyboard handling intact.
 *
 * Renders nothing when VITE_GOOGLE_CLIENT_ID is unset, so the login page stays
 * usable in environments without Google configured.
 */
export default function GoogleButton({ onCredential, disabled = false, text = 'continue_with' }) {
  const { t, i18n } = useTranslation('account');
  const wrapperRef = useRef(null);
  const holderRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  // Keep the latest handler without re-rendering Google's button on every keystroke.
  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    let cancelled = false;

    loadGis()
      .then(() => {
        if (cancelled || !holderRef.current) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response?.credential) callbackRef.current?.(response.credential);
          },
          cancel_on_tap_outside: true,
        });

        // Re-rendered on a language switch, so wipe the previous button first.
        holderRef.current.innerHTML = '';

        window.google.accounts.id.renderButton(holderRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          logo_alignment: 'center',
          // Invisible, but it supplies the accessible name — keep it in the page language.
          locale: i18n.language,
          // GIS needs a pixel width; match the button we paint underneath it.
          width: Math.round(wrapperRef.current?.getBoundingClientRect().width) || 360,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [text, i18n.language]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div>
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
          {t('auth.or')}
        </span>
        <span className="h-px flex-1 bg-ink-200" />
      </div>

      {failed ? (
        <p className="text-center text-sm text-ink-500">{t('auth.googleUnavailable')}</p>
      ) : (
        <div
          ref={wrapperRef}
          // Google's iframe can't be disabled, so block it while a request is in flight.
          className={`group relative w-full ${disabled ? 'pointer-events-none opacity-60' : ''}`}
          aria-busy={disabled}
        >
          <span
            // Purely decorative: the real control is Google's button layered above, so
            // its hover and focus states have to be mirrored from the wrapper.
            aria-hidden="true"
            className="btn-outline w-full gap-2.5 !py-3 group-hover:border-brand-500 group-hover:text-brand-600 group-focus-within:ring-2 group-focus-within:ring-brand-500 group-focus-within:ring-offset-2 group-active:scale-[.98]"
          >
            <GoogleMark />
            {t('auth.continueWithGoogle')}
          </span>

          {/* Google's button is a hair shorter than ours; centre it so the hit area lines up. */}
          <div
            ref={holderRef}
            className="absolute inset-0 z-10 flex items-center overflow-hidden opacity-0"
          />
        </div>
      )}
    </div>
  );
}
