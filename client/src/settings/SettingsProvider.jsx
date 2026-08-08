import { useCallback, useEffect, useMemo } from 'react';

import { settingApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { EVENTS } from '../realtime/events';
import { useLiveRefetch } from '../realtime/useRealtime';
import { APP_NAME } from '../utils/constants';
import SettingsContext from './SettingsContext';

/**
 * Store identity — name, logo, favicon, contact details, social profiles — fetched
 * once for the whole app instead of per component.
 *
 * The header, the footer and the auth screens all render the brand, and the footer
 * and the contact page both need the address block; fetching here means one request
 * on boot rather than one per consumer, and one place for the admin's changes to
 * land. `useFetch` re-runs on a language switch, so translated settings follow the
 * active language, and the realtime hook picks up an admin save without a reload.
 */
export default function SettingsProvider({ children }) {
  const query = useFetch(useCallback(() => settingApi.get(), []), []);
  useLiveRefetch(query.refetch, [EVENTS.SETTINGS_UPDATED]);

  const settings = query.data?.data?.settings;

  const value = useMemo(() => {
    const s = settings || {};
    const branding = s.branding || {};
    return {
      settings: s,
      general: s.general || {},
      seo: s.seo || {},
      social: s.social || {},
      branding,
      careers: s.careers || {},
      // The admin's name wins; VITE_APP_NAME is only the pre-configuration default.
      siteName: s.general?.siteName?.trim() || APP_NAME,
      logoUrl: branding.logo?.url || '',
      loading: query.loading,
      error: query.error,
      refetch: query.refetch,
    };
  }, [settings, query.loading, query.error, query.refetch]);

  // The tab icon is part of the same branding, and index.html can only carry a
  // build-time default — swap it in once the admin's upload is known.
  useEffect(() => {
    const href = value.branding.favicon?.url;
    if (!href) return;
    const link = document.querySelector("link[rel='icon']") || document.createElement('link');
    link.rel = 'icon';
    // Cloudinary serves the real type; the build-time default is an SVG, so drop
    // the stale hint rather than mislabel a PNG.
    link.removeAttribute('type');
    link.href = href;
    if (!link.parentNode) document.head.appendChild(link);
  }, [value.branding.favicon?.url]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
