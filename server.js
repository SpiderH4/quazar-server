const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CACHE_DIR = '/tmp/quazar_audio';
const URL_CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Crear directorio de cache
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

async function getAudioUrl(videoId) {
  const cached = URL_CACHE.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.url;

  const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    getUrl: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0'],
  });

  const url = (Array.isArray(output) ? output[0] : output).trim();
  URL_CACHE.set(videoId, { url, ts: Date.now() });
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

    Promise.all(songs.slice(0, 3).map(s => getAudioUrl(s.id).catch(() => {})));

    res.json({ songs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sirve el audio con soporte completo de range requests
app.get('/audio/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const filePath = path.join(CACHE_DIR, `${videoId}.m4a`);

  try {
    // Si ya está descargado, servirlo directamente
    if (fs.existsSync(filePath)) {
      console.log(`✅ Archivo en cache: ${videoId}`);
      return serveFile(filePath, req, res);
    }

    console.log(`⬇️ Descargando: ${videoId}`);

    // Descargar con yt-dlp
    await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      format: 'bestaudio[ext=m4a]/bestaudio',
      output: filePath,
      noCheckCertificates: true,
      noWarnings: true,
    });

    if (fs.existsSync(filePath)) {
      return serveFile(filePath, req, res);
    }

    res.status(500).json({ error: 'No se pudo descargar el audio' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

function serveFile(filePath, req, res) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'audio/mp4',
      'Access-Control-Allow-Origin': '*',
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    });

    fs.createReadStream(filePath).pipe(res);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Quazar corriendo en puerto ${PORT} 🎵`));