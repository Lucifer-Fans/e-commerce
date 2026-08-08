import { createContext } from 'react';

/**
 * Lives apart from the provider and the hook so each file exports one kind of
 * thing — which is what keeps Fast Refresh working on the provider component.
 */
const LanguageContext = createContext(null);

export default LanguageContext;
