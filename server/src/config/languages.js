/**
 * Interface languages the storefront ships. Mirrors client/src/i18n/languages.js —
 * the client owns the display metadata (native name, landmark), the server only
 * needs the set of codes it is willing to store on a user.
 *
 * Adding a language means adding its code here and its JSON bundles on the client;
 * nothing else on the server is language-aware.
 */
const SUPPORTED_LANGUAGES = [
  'en', // English
  'hi', // Hindi
  'ta', // Tamil
  'te', // Telugu
  'kn', // Kannada
  'mr', // Marathi
  'bn', // Bengali
  'gu', // Gujarati
  'or', // Odia
  'ml', // Malayalam
  'pa', // Punjabi
  'as', // Assamese
];

const DEFAULT_LANGUAGE = 'en';

module.exports = { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE };
