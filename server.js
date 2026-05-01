const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Cache — evita llamar yt-dlp más de una vez por canción
const urlCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function getAudioUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log(`✅ Cache hit: ${videoId}`);
    return cached.url;
  }

  console.log(`🔄 Fetching: ${videoId}`);
  const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    getUrl: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0'],
  });

  const url = (Array.isArray(output) ? output[0] : output).trim();
  urlCache.set(videoId, { url, ts: Date.now() });
  console.log(`✅ Cached: ${videoId}`);
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

    // Pre-cachear primeras 5 canciones en paralelo mientras el usuario ve resultados
    Promise.all(songs.slice(0, 5).map(s => getAudioUrl(s.id).catch(() => {})));

    res.json({ songs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/proxy/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const audioUrl = await getAudioUrl(videoId);
    const { default: fetch } = await import('node-fetch');

    const audioResponse = await fetch(audioUrl, {
      headers: {
        'referer': 'https://www.youtube.com',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'range': req.headers.range || 'bytes=0-',
      },
    });

    res.setHeader('Content-Type', audioResponse.headers.get('content-type') || 'audio/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

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