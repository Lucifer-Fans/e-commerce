import { Component } from 'react';
import { withTranslation } from 'react-i18next';
import Icon from './Icon';

/**
 * Catches render-time crashes so a single broken component doesn't blank the app.
 * Must stay a class — there is no hook equivalent for componentDidCatch — so it
 * takes `t` through the HOC instead of the hook.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Replace with your error reporting service in production.
    console.error('Render error:', error, info?.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    const { t } = this.props;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-danger">
          <Icon name="alert" size={36} />
        </div>
        <h1 className="mb-2 text-xl font-bold text-ink-900">{t('errors.boundaryTitle')}</h1>
        <p className="mb-6 max-w-md text-sm text-ink-500">{t('errors.boundaryMessage')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={this.reset} className="btn-primary">
            <Icon name="refresh" size={16} />
            {t('actions.retry')}
          </button>
          <button type="button" onClick={() => window.location.reload()} className="btn-outline">
            {t('errors.reload')}
          </button>
          <a href="/" className="btn-outline">
            {t('actions.goHome')}
          </a>
        </div>

        {import.meta.env.DEV && this.state.error && (
          <pre className="mt-8 max-w-2xl overflow-auto rounded-lg bg-ink-900 p-4 text-left text-xs text-red-300">
            {this.state.error.stack || String(this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}

export default withTranslation()(ErrorBoundary);
