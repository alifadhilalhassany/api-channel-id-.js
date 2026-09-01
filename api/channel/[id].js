export default async function handler(req, res) {
  try {
    const url = `http://def.ycnapi.com/api/channel/${req.query.id}`;

    const response = await fetch(url);

    const text = await response.text();

    return res.status(200).json({
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength: text.length,
      preview: text.substring(0, 100),
      data: text
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
