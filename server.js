const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = 'https://momonga.mangandade.workers.dev';
const TARGET_HOST = 'momonga.mangandade.workers.dev';

console.log('Starting server on port', PORT);

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  selfHandleResponse: true, // 自分でレスポンスを処理する

  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('Host', TARGET_HOST);
    proxyReq.removeHeader('referer');
    proxyReq.removeHeader('origin');
  },

  onProxyRes: (proxyRes, req, res) => {
    // ステータスコードを設定
    res.statusCode = proxyRes.statusCode;

    // ヘッダーをコピー（書き換え対象のヘッダーは除外）
    Object.keys(proxyRes.headers).forEach((key) => {
      const lower = key.toLowerCase();
      if (
        lower !== 'content-length' &&
        lower !== 'content-encoding' &&
        lower !== 'content-security-policy' &&
        lower !== 'x-frame-options'
      ) {
        res.setHeader(key, proxyRes.headers[key]);
      }
    });

    const chunks = [];

    proxyRes.on('data', (chunk) => {
      chunks.push(chunk);
    });

    proxyRes.on('end', () => {
      let buffer = Buffer.concat(chunks);
      const encoding = proxyRes.headers['content-encoding'];
      const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();

      // 圧縮解除
      try {
        if (encoding === 'gzip') {
          buffer = zlib.gunzipSync(buffer);
        } else if (encoding === 'br') {
          buffer = zlib.brotliDecompressSync(buffer);
        } else if (encoding === 'deflate') {
          buffer = zlib.inflateSync(buffer);
        }
      } catch (err) {
        console.error('Decompress error:', err.message);
      }

      // HTML / CSS / JS / JSON のみ書き換え
      const shouldRewrite =
        contentType.includes('text/html') ||
        contentType.includes('text/css') ||
        contentType.includes('javascript') ||
        contentType.includes('application/json') ||
        contentType.includes('text/plain');

      if (shouldRewrite) {
        try {
          let text = buffer.toString('utf8');

          const host = req.headers.host;
          const protocol = req.headers['x-forwarded-proto'] || 'https';
          const currentOrigin = `${protocol}://${host}`;

          // 絶対URLを現在のドメインに置換
          text = text
            .replaceAll(`https://${TARGET_HOST}`, currentOrigin)
            .replaceAll(`http://${TARGET_HOST}`, currentOrigin)
            .replaceAll(`//${TARGET_HOST}`, `//${host}`)
            .replaceAll(TARGET_HOST, host);

          buffer = Buffer.from(text, 'utf8');
        } catch (err) {
          console.error('Rewrite error:', err.message);
        }
      }

      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
    });

    proxyRes.on('error', (err) => {
      console.error('Response stream error:', err.message);
      if (!res.headersSent) {
        res.status(502).end('Bad Gateway');
      }
    });
  },

  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).send('Bad Gateway');
    }
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server successfully started on port ${PORT}`);
});
