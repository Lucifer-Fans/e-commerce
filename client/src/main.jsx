import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
// Side-effect import: initialises i18next (and applies <html lang>) before the
// first render, so nothing ever paints an untranslated frame.
import './i18n';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Outside the boundary so a non-English shell bundle can suspend on the very
        first paint; the boundary still catches every render error below it. */}
    <Suspense fallback={null}>
      <ErrorBoundary>
        <Provider store={store}>
          <App />
        </Provider>
      </ErrorBoundary>
    </Suspense>
  </React.StrictMode>
);
