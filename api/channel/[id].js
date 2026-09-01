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
        error: "Upstream API error",
        status: response.status
      });
    }

    const data = await response.text();

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(data);

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}
