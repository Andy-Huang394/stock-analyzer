import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import './styles/theme.css';
import { antdThemeConfig } from './styles/palette';
import App from './App';

// 组件里大量使用静态 message / notification / Modal.confirm，
// 它们渲染在 React 树之外，读不到 <ConfigProvider> 的主题，需要全局配置一次，否则会是默认白底。
ConfigProvider.config({
  holderRender: (children) => (
    <ConfigProvider theme={antdThemeConfig}>{children}</ConfigProvider>
  ),
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ConfigProvider theme={antdThemeConfig}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
