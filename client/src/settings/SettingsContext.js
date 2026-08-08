import { createContext } from 'react';
import { APP_NAME } from '../utils/constants';

/**
 * Lives apart from the provider and the hook so each file exports one kind of
 * thing — which is what keeps Fast Refresh working on the provider component.
 *
 * The default is a working value rather than `null`: `<Seo>` and the brand mark
 * render on the error routes too, and a missing provider should degrade to the
 * build-time name instead of throwing on top of whatever already went wrong.
 */
export const FALLBACK_SETTINGS = {
  settings: {},
  general: {},
  seo: {},
  social: {},
  branding: {},
  careers: {},
  siteName: APP_NAME,
  logoUrl: '',
  loading: false,
  error: null,
  refetch: () => {},
};

const SettingsContext = createContext(FALLBACK_SETTINGS);

export default SettingsContext;
