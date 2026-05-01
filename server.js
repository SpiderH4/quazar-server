const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Cache de URLs para no llamar yt-dlp cada vez
const urlCache = new Map();
const CACHE_DURATION = 3 * 60 * 1000; // 3 minutos

async function getAudioUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.url;
  }

  const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    getUrl: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'],
  });

  const url = (Array.isArray(output) ? output[0] : output).trim();
  urlCache.set(videoId, { url, timestamp: Date.now() });
  return url;
}

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

app.get('/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;
  try {
    const url = await getAudioUrl(videoId);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy con soporte completo de range requests
app.get('/proxy/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const audioUrl = await getAudioUrl(videoId);
    const { default: fetch } = await import('node-fetch');

    const rangeHeader = req.headers.range;
    const headers = {
      'referer': 'https://www.youtube.com',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'origin': 'https://www.youtube.com',
    };

    if (rangeHeader) {
      headers['range'] = rangeHeader;
    }

    const audioResponse = await fetch(audioUrl, { headers });

    // Copiar headers relevantes
    const contentType = audioResponse.headers.get('content-type') || 'audio/webm';
    const contentLength = audioResponse.headers.get('content-length');
    const contentRange = audioResponse.headers.get('content-range');
    const acceptRanges = audioResponse.headers.get('accept-ranges') || 'bytes';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    res.status(audioResponse.status);
    audioResponse.body.pipe(res);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Quazar corriendo en puerto ${PORT} 🎵`));