const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor Quazar funcionando 🎵' });
});

app.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Falta el parámetro q' });

  try {
    const { default: fetch } = await import('node-fetch');
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&q=${encodeURIComponent(q)}&maxResults=20&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) return res.status(500).json({ error: data.error.message });

    const songs = data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.high.url,
    }));

    res.json({ songs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Devuelve la URL del stream
app.get('/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      format: 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
      getUrl: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0'],
    });

    const url = Array.isArray(output) ? output[0] : output;
    if (!url) return res.status(404).json({ error: 'No se encontró audio' });

    res.json({ url: url.trim() });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo stream: ' + error.message });
  }
});

// Proxy del audio — Android puede reproducir esto directamente
app.get('/proxy/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      format: 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
      getUrl: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0'],
    });

    const audioUrl = Array.isArray(output) ? output[0] : output;
    if (!audioUrl) return res.status(404).json({ error: 'No se encontró audio' });

    const { default: fetch } = await import('node-fetch');
    const audioResponse = await fetch(audioUrl.trim(), {
      headers: {
        'referer': 'https://www.youtube.com',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'range': req.headers.range || 'bytes=0-',
      },
    });

    res.setHeader('Content-Type', audioResponse.headers.get('content-type') || 'audio/webm');
    res.setHeader('Accept-Ranges', 'bytes');

    const contentRange = audioResponse.headers.get('content-range');
    const contentLength = audioResponse.headers.get('content-length');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    res.status(audioResponse.status);
    audioResponse.body.pipe(res);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Quazar corriendo en puerto ${PORT} 🎵`));

