async function getAudioUrlInnertube(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.url;
  }

  const { default: fetch } = await import('node-fetch');

  // Intentar múltiples clientes
  const clients = [
    {
      clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientVersion: '2.0',
      key: 'AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8',
    },
    {
      clientName: 'IOS',
      clientVersion: '19.09.3',
      key: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
    },
    {
      clientName: 'ANDROID_EMBEDDED_PLAYER',
      clientVersion: '19.09.37',
      key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    },
  ];

  for (const client of clients) {
    try {
      const payload = {
        videoId,
        context: {
          client: {
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            hl: 'en',
            gl: 'US',
          }
        }
      };

      const response = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${client.key}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        }
      );

      const data = await response.json();
      const formats = [
        ...(data.streamingData?.adaptiveFormats || []),
        ...(data.streamingData?.formats || []),
      ].filter(f => f.mimeType?.includes('audio') && f.url);

      if (formats.length > 0) {
        const m4a = formats.find(f => f.mimeType?.includes('mp4'));
        const best = m4a || formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        if (best?.url) {
          urlCache.set(videoId, { url: best.url, ts: Date.now() });
          return best.url;
        }
      }
    } catch (_) {
      continue;
    }
  }

  // Fallback a yt-dlp si todos los clientes fallan
  const youtubedl = require('youtube-dl-exec');
  const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    format: 'bestaudio[ext=m4a]/bestaudio',
    getUrl: true,
    noCheckCertificates: true,
    noWarnings: true,
  });

  const url = (Array.isArray(output) ? output[0] : output).trim();
  urlCache.set(videoId, { url, ts: Date.now() });
  return url;
}