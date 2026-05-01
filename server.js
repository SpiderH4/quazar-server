const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor Quazar funcionando 🎵' });
});

// Buscar canciones
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

// Obtener detalles de una canción
app.get('/song/:videoId', async (req, res) => {
  const { videoId } = req.params;
  try {
    const { default: fetch } = await import('node-fetch');
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.items?.length) return res.status(404).json({ error: 'Video no encontrado' });

    const item = data.items[0];
    res.json({
      id: videoId,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.high.url,
      duration: item.contentDetails.duration,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stream de audio via Piped (múltiples instancias)
app.get('/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;
  try {
    const { default: fetch } = await import('node-fetch');

    const instances = [
      'https://pipedapi.kavin.rocks',
      'https://piped-api.garudalinux.org',
      'https://api.piped.projectsegfau.lt',
    ];

    let audioUrl = null;
    for (const instance of instances) {
      try {
        const response = await fetch(`${instance}/streams/${videoId}`, {
          signal: AbortSignal.timeout(6000)
        });
        if (!response.ok) continue;
        const data = await response.json();
        const stream = data.audioStreams
          ?.sort((a, b) => b.bitrate - a.bitrate)
          ?.find(s => s.mimeType?.includes('audio'));
        if (stream?.url) {
          audioUrl = stream.url;
          break;
        }
      } catch (_) { continue; }
    }

    if (!audioUrl) return res.status(503).json({ error: 'No se pudo obtener el audio' });
    res.json({ url: audioUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Quazar corriendo en puerto ${PORT} 🎵`));