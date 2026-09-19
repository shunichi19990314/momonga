const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = 'https://momonga.mangandade.workers.dev';
const TARGET_HOST = 'momonga.mangandade.workers.dev';

// プロキシ設定
const proxy = createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  selfHandleResponse: true, // 自分でレスポンスを処理する
  followRedirects: true,

  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('Host', TARGET_HOST);
    proxyReq.removeHeader('referer');
    proxyReq.removeHeader('origin');
  },

  onProxyRes: async (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] || '';
    const isHtml = contentType.includes('text/html');
    const isText = isHtml || 
                   contentType.includes('text/css') || 
                   contentType.includes('javascript') || 
                   contentType.includes('application/json') ||
                   contentType.includes('text/plain');

    // ステータスコードとヘッダーをコピー
    res.status(proxyRes.statusCode);

    // 不要なヘッダーを削除
    const headers = { ...proxyRes.headers };
    delete headers['content-security-policy'];
    delete headers['x-frame-options'];
    delete headers['content-length']; // 書き換え後に変わるため

    // 圧縮されている場合は解凍してから処理
    let body = [];
    proxyRes.on('data', chunk => body.push(chunk));
    proxyRes.on('end', () => {
      let buffer = Buffer.concat(body);

      // gzip / brotli / deflate 対応
      const encoding = proxyRes.headers['content-encoding'];
      try {
        if (encoding === 'gzip') {
          buffer = zlib.gunzipSync(buffer);
        } else if (encoding === 'br') {
          buffer = zlib.brotliDecompressSync(buffer);
        } else if (encoding === 'deflate') {
          buffer = zlib.inflateSync(buffer);
        }
      } catch (e) {
        console.error('Decompress error:', e.message);
      }

      // テキスト系ならURLを書き換える
      if (isText) {
        let text = buffer.toString('utf8');

        // 現在のホスト（Renderのドメイン）を取得
        const currentHost = req.headers.host; // 例: momonga-mirror.onrender.com
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const currentOrigin = `${protocol}://${currentHost}`;

        // 絶対URLを現在のドメインに置き換え
        text = text
          .replaceAll(`https://${TARGET_HOST}`, currentOrigin)
          .replaceAll(`http://${TARGET_HOST}`, currentOrigin)
          .replaceAll(`//${TARGET_HOST}`, `//${currentHost}`)
          .replaceAll(TARGET_HOST, currentHost); // 念のため

        buffer = Buffer.from(text, 'utf8');

        // 圧縮を解除したので content-encoding を消す
        delete headers['content-encoding'];
      }

      // ヘッダーをセットして返す
      Object.keys(headers).forEach(key => {
        res.setHeader(key, headers[key]);
      });
      res.setHeader('content-length', buffer.length);
      res.end(buffer);
    });
  },

  onError: (err, req, res) => {
    console.error(`[Proxy Error] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.status(502).send('Bad Gateway');
    }
  },
});

app.use('/', proxy);

// ヘルスチェック
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`Momonga Full Mirror running on port ${PORT}`);
});
