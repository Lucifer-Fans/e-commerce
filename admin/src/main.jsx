import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';
import RootErrorFallback from './components/common/RootErrorFallback';

// Last line of defence: a crash in the theme/provider tree, above any router.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorFallback>
      <Provider store={store}>
        <App />
      </Provider>
    </RootErrorFallback>
  </React.StrictMode>
);
