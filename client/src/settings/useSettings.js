import { useContext } from 'react';
import SettingsContext from './SettingsContext';

/**
 * Admin-managed store settings.
 *
 * @returns {{
 *   settings: object,
 *   general: object,
 *   seo: object,
 *   social: object,
 *   branding: object,
 *   careers: object,
 *   siteName: string,
 *   logoUrl: string,
 *   loading: boolean,
 *   error: Error | null,
 *   refetch: () => void,
 * }}
 */
export default function useSettings() {
  return useContext(SettingsContext);
}
