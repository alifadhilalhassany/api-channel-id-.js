export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      error: "Missing channel ID"
    });
  }

  try {
    const response = await fetch(
      `http://def.ycnapi.com/api/channel/${encodeURIComponent(id)}`
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "Upstream API error"
      });
    }

    const data = await response.json();

    // إذا كان الـAPI يرجع رابط M3U8 مباشرة
    const m3u8 =
      data.m3u8 ||
      data.url ||
      data.stream ||
      data.stream_url;

    if (!m3u8) {
      return res.status(422).json({
        error: "No M3U8 URL found in API response",
        response: data
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");

    return res.status(200).send(m3u8);

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}
