import { createTheme } from '@mui/material/styles';

/** One theme object drives every MUI surface, so the panel stays visually consistent. */
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2563eb', dark: '#1d4ed8', light: '#60a5fa' },
    secondary: { main: '#0f172a' },
    success: { main: '#16a34a' },
    warning: { main: '#f59e0b' },
    error: { main: '#dc2626' },
    info: { main: '#0ea5e9' },
    background: { default: '#f1f5f9', paper: '#ffffff' },
    text: { primary: '#0f172a', secondary: '#64748b' },
    divider: '#e2e8f0',
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
    h4: { fontWeight: 800, fontSize: '1.65rem' },
    h5: { fontWeight: 700, fontSize: '1.3rem' },
    h6: { fontWeight: 700, fontSize: '1.05rem' },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    /**
     * Scrollbars are styled once, here, rather than per scroll container: the
     * sidebar, the sub-category lists and any table that overflows all end up
     * with the same slim slate bar instead of the chunky native Windows one.
     *
     * A transparent track means the bar reads as part of the surface it sits on
     * rather than as a grey channel cut into it, and the thumb only firms up on
     * hover so a resting card stays quiet. Both the WebKit pseudo-elements and
     * the standard `scrollbar-*` properties are set — Firefox honours only the
     * latter, Chrome and Edge prefer the former.
     */
    MuiCssBaseline: {
      styleOverrides: {
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: '#cbd5e1 transparent',
        },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: '#cbd5e1',
          borderRadius: 8,
          // A transparent border with `background-clip` is the only way to inset
          // a WebKit thumb — padding does nothing there. It leaves the bar
          // reading as ~4px while the 8px track stays an easy pointer target.
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': { backgroundColor: '#94a3b8' },
        // Where a vertical and a horizontal bar meet, the default corner is a
        // light grey square that shows up against a white card.
        '*::-webkit-scrollbar-corner': { background: 'transparent' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        elevation1: { boxShadow: '0 1px 3px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)' },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: '1px solid #e2e8f0', borderRadius: 12 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 8, paddingInline: 18 } },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiSelect: { defaultProps: { size: 'small' } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 6 } } },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, backgroundColor: '#f8fafc', color: '#334155', whiteSpace: 'nowrap' },
      },
    },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});

export default theme;
