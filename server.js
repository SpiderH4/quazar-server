const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();

const execAsync = promisify(exec);
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

// Stream con yt-dlp
app.get('/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const { stdout } = await execAsync(
      `yt-dlp -f bestaudio --get-url "https://www.youtube.com/watch?v=${videoId}"`,
      { timeout: 30000 }
    );

    const url = stdout.trim();
    if (!url) return res.status(404).json({ error: 'No se encontró audio' });

    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: 'yt-dlp falló: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Quazar corriendo en puerto ${PORT} 🎵`));