const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Cache de URLs
const urlCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Llama directamente a la API interna de YouTube (Innertube)
async function getAudioUrlInnertube(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.url;
  }

  const { default: fetch } = await import('node-fetch');

  const payload = {
    videoId,
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
      }
    }
  };

  const response = await fetch(
    'https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': '19.09.37',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  // Buscar el mejor formato de audio
  const formats = [
    ...(data.streamingData?.adaptiveFormats || []),
    ...(data.streamingData?.formats || []),
  ].filter(f => f.mimeType?.includes('audio'));

  // Preferir m4a (aac) porque Android lo reproduce sin problemas
  const m4a = formats.find(f => f.mimeType?.includes('mp4') || f.mimeType?.includes('m4a'));
  const best = m4a || formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  if (!best?.url) throw new Error('No se encontró URL de audio');

  urlCache.set(videoId, { url: best.url, ts: Date.now() });
  return best.url;
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

    // Pre-cachear primeras 5 canciones en paralelo
    Promise.all(songs.slice(0, 5).map(s => getAudioUrlInnertube(s.id).catch(() => {})));

    res.json({ songs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;
  try {
    const url = await getAudioUrlInnertube(videoId);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/proxy/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const audioUrl = await getAudioUrlInnertube(videoId);
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