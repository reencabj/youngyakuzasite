// Devuelve los últimos N videos de un canal de YouTube (via RSS) en JSON
export async function handler(event) {
  try {
    const qs = event.queryStringParameters || {};
    const channel = (qs.channel || "").trim(); // channel_id (UC...)
    const max = Math.max(1, Math.min(20, parseInt(qs.max || "6", 10)));
    if (!channel) return { statusCode: 400, body: JSON.stringify({ error: "channel required" }) };

    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel)}`;
    const res = await fetch(url, { headers: { "Accept": "application/rss+xml" } });
    const xml = await res.text();

    // Parseo simple de RSS (título, videoId, fecha, thumbnail)
    const entries = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].slice(0, max).map(e => {
      const block = e[0];
      const id = (block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
      const title = (block.match(/<title>([^<]+)<\/title>/) || [])[1];
      const published = (block.match(/<published>([^<]+)<\/published>/) || [])[1];
      const thumb = (block.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1];
      return { id, title, published, thumb };
    });

    return { statusCode: 200, body: JSON.stringify({ items: entries }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ items: [], error: String(e) }) };
  }
}
