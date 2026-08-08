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

/**
 * Renders Google's official "Sign in with Google" button and hands the returned
 * ID token to `onCredential`. Renders nothing when VITE_GOOGLE_CLIENT_ID is unset,
 * so the login page stays usable in environments without Google configured.
 */
export default function GoogleButton({ onCredential, disabled = false, text = 'signin_with' }) {
  const { t, i18n } = useTranslation('account');
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
          // Google renders its own copy ("Sign in with Google"); this keeps that
          // in step with the rest of the page.
          locale: i18n.language,
          // GIS needs a pixel width; match whatever the auth card gives us.
          width: Math.round(holderRef.current.getBoundingClientRect().width) || 360,
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
          ref={holderRef}
          // The iframe Google renders can't be disabled, so block it while a request is in flight.
          className={`flex min-h-[44px] justify-center ${
            disabled ? 'pointer-events-none opacity-60' : ''
          }`}
          aria-busy={disabled}
        />
      )}
    </div>
  );
}
