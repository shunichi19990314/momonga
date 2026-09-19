const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Starting server on port', PORT);

app.use('/', createProxyMiddleware({
  target: 'https://momonga.mangandade.workers.dev',
  changeOrigin: true,
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('Host', 'momonga.mangandade.workers.dev');
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    res.status(502).send('Bad Gateway');
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server successfully started on port ${PORT}`);
});
