import { Component } from 'react';

/**
 * Sits ABOVE ThemeProvider/Redux/Router, so it deliberately renders plain
 * inline-styled markup — no MUI, no theme, no store. If those are what broke,
 * this is still able to paint something other than a white screen.
 */
export default class RootErrorFallback extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Fatal admin error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          color: '#0f172a',
          background: '#f8fafc',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>The admin console failed to start</h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px', maxWidth: 460 }}>
          Something crashed before the interface could load. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            background: '#2563eb',
            border: 0,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Reload page
        </button>

        {import.meta.env.DEV && (
          <pre
            style={{
              marginTop: 32,
              padding: 16,
              maxWidth: 760,
              maxHeight: 300,
              overflow: 'auto',
              textAlign: 'left',
              fontSize: 12,
              background: '#0f172a',
              color: '#fca5a5',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
            }}
          >
            {error.stack || String(error)}
          </pre>
        )}
      </div>
    );
  }
}
