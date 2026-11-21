import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { DemoAuthProvider } from './lib/demoAuth';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DemoAuthProvider>
        <App />
      </DemoAuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
