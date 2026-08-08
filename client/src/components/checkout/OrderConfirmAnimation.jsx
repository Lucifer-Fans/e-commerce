import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../styles/order-confirm.css';

const TOTAL_MS = 5000;

/**
 * Confirmation cinematic shown inside the checkout content area: the parcel leaps off
 * the pad, arcs into the delivery truck, and the truck drives off before we hand over
 * to the success page. Purely decorative — the order already exists by the time this
 * mounts, so nothing here can fail the order.
 */
export default function OrderConfirmAnimation({ onDone }) {
  const { t } = useTranslation('checkout');
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onDone();
      return undefined;
    }

    const fade = setTimeout(() => setLeaving(true), TOTAL_MS - 400);
    const finish = setTimeout(onDone, TOTAL_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(finish);
    };
  }, [onDone]);

  return (
    <div
      className={`oc-panel ${leaving ? 'is-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={t('confirm.status')}
    >
      <div className="oc-decor" aria-hidden="true">
        <svg className="oc-squiggle oc-squiggle--tl" viewBox="0 0 260 160">
          <path d="M-6 54C34 8 76 116 120 72S206 4 266 54" />
        </svg>
        <svg className="oc-squiggle oc-squiggle--br" viewBox="0 0 240 150">
          <path d="M240 18C184 36 224 106 160 116S56 98 0 152" />
        </svg>

        <svg className="oc-wifi" viewBox="0 0 60 46">
          <path d="M6 20a34 34 0 0 1 48 0" />
          <path d="M16 30a20 20 0 0 1 28 0" />
          <path d="M26 39a7 7 0 0 1 8 0" />
        </svg>

        <svg className="oc-cloud" viewBox="0 0 120 60">
          <path d="M28 50h62a16 16 0 0 0 1-32 24 24 0 0 0-45-6A17 17 0 0 0 28 50z" />
        </svg>
      </div>

      <div className="oc-scene">
        <span className="oc-pill">{t('confirm.pill')}</span>
        <h2 className="oc-title">{t('confirm.title')}</h2>
        <p className="oc-subtitle">{t('confirm.subtitle')}</p>

        <div className="oc-stage">
          <div className="oc-pad">
            {/* Parcel */}
            <svg className="oc-parcel" viewBox="0 0 100 76">
              <path d="M6 22h88v46a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z" fill="#e2e8f0" />
              <path d="M2 6h96a4 4 0 0 1 4 4v12H-2V10a4 4 0 0 1 4-4z" fill="#f1f5f9" />
              <rect x="41" y="6" width="18" height="68" fill="#2563eb" />
              <rect x="41" y="0" width="18" height="10" rx="3" fill="#f59e0b" />
            </svg>
          </div>

          {/* Flight path */}
          <svg className="oc-arrow" viewBox="0 0 160 90">
            {/* Curve, then a head whose wings sit on the curve's exit tangent at (138,40). */}
            <path d="M6 78C22 20 92 6 138 40" />
            <path className="oc-arrow-head" d="M129 20L138 40L116 38" />
          </svg>

          {/* Delivery truck */}
          <svg className="oc-truck" viewBox="0 0 200 120">
            <rect x="4" y="26" width="108" height="62" rx="5" fill="#2563eb" />
            <rect x="4" y="26" width="108" height="13" fill="#dbeafe" />
            <rect x="4" y="52" width="108" height="9" fill="#dbeafe" />
            <path d="M116 44h34l30 26v18h-64z" fill="#f59e0b" />
            <path d="M124 50h22l20 18h-42z" fill="#e0f2fe" />
            <rect x="0" y="88" width="188" height="8" rx="4" fill="#334155" />
            <g className="oc-wheel">
              <circle cx="44" cy="96" r="15" fill="#1e293b" />
              <circle cx="44" cy="96" r="6" fill="#cbd5e1" />
            </g>
            <g className="oc-wheel">
              <circle cx="150" cy="96" r="15" fill="#1e293b" />
              <circle cx="150" cy="96" r="6" fill="#cbd5e1" />
            </g>
          </svg>

          <div className="oc-check">
            <span>
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
          </div>
        </div>

        <p className="oc-status">{t('confirm.status')}</p>
        <div className="oc-track">
          <i />
        </div>
      </div>
    </div>
  );
}
