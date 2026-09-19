const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = 'https://momonga.mangandade.workers.dev';

// すべてのリクエストをプロキシ
app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  selfHandleResponse: false,          // レスポンスをそのまま返す
  followRedirects: true,              // リダイレクトを追従
  // 必要に応じてパス書き換え（通常は不要）
  // pathRewrite: { '^/': '/' },

  onProxyReq: (proxyReq, req, res) => {
    // HostヘッダーをWorker側に合わせる
    proxyReq.setHeader('Host', 'momonga.mangandade.workers.dev');
    
    // 元のRefererなどをクリアして自然に見せる（任意）
    proxyReq.removeHeader('referer');
    proxyReq.removeHeader('origin');
  },

  onProxyRes: (proxyRes, req, res) => {
    // セキュリティヘッダーなど不要なものを削除（任意）
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    
    // CORSを許可したい場合（フロントから直接使う場合）
    // proxyRes.headers['access-control-allow-origin'] = '*';
  },

  onError: (err, req, res) => {
    console.error(`[Proxy Error] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.status(502).send('Bad Gateway - ミラー先に接続できません');
    }
  },

  // ログを出したい場合
  logLevel: 'warn',
}));

// ヘルスチェック用（任意）
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`Momonga Mirror is running on port ${PORT}`);
  console.log(`Target: ${TARGET}`);
});
