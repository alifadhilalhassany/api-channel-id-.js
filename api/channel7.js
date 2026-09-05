const API_BASE = "https://def.yacinelive.com";
const XOR_KEY = "c!xZj+N9&G@Ev@vw";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/139.0.0.0 Safari/537.36";

const REFERER = "https://x.com/";

function decrypt(base64, key) {
  const buffer = Buffer.from(base64.trim(), "base64");
  let result = "";

  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(
      buffer[i] ^ key.charCodeAt(i % key.length)
    );
  }

  return result;
}

export default async function handler(req, res) {
  try {
    const channelId = req.query?.id || "4";

    // 1. جلب API
    const apiResponse = await fetch(
      `${API_BASE}/api/channel/${encodeURIComponent(channelId)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "*/*"
        },
        cache: "no-store"
      }
    );

    const encrypted = await apiResponse.text();

    if (!apiResponse.ok) {
      return res.status(200).json({
        success: false,
        step: "API",
        status: apiResponse.status
      });
    }

    // 2. Header t
    const timestamp =
      apiResponse.headers.get("t");

    if (!timestamp) {
      return res.status(200).json({
        success: false,
        step: "HEADER",
        error: "Header t غير موجود"
      });
    }

    // 3. فك البيانات
    const decrypted = decrypt(
      encrypted,
      XOR_KEY + timestamp
    );

    let data;

    try {
      data = JSON.parse(decrypted);
    } catch {
      return res.status(200).json({
        success: false,
        step: "JSON",
        preview: decrypted.substring(0, 300)
      });
    }

    // 4. استخراج الرابط
    const channel =
      data?.data?.[0] ||
      data?.data ||
      data?.channel ||
      data;

    const redirectUrl =
      channel?.url ||
      channel?.stream_url ||
      channel?.stream ||
      channel?.link;

    if (!redirectUrl) {
      return res.status(200).json({
        success: false,
        step: "URL",
        error: "رابط القناة غير موجود"
      });
    }

    // 5. الحصول على الرابط النهائي
    const redirectResponse = await fetch(
      redirectUrl,
      {
        redirect: "manual",
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": REFERER,
          "Accept": "*/*"
        },
        cache: "no-store"
      }
    );

    const finalUrl =
      redirectResponse.headers.get("location");

    if (!finalUrl) {
      return res.status(200).json({
        success: false,
        step: "REDIRECT",
        status: redirectResponse.status
      });
    }

    // 6. جلب الـM3U8 نفسه
    const playlistResponse = await fetch(
      finalUrl,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": REFERER,
          "Accept": "*/*"
        },
        cache: "no-store"
      }
    );

    const playlistText =
      await playlistResponse.text();

    // 7. استخراج أول روابط من الـplaylist
    const lines =
      playlistText
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(x => x && !x.startsWith("#"));

    const playlistBase =
      new URL(finalUrl);

    const segmentUrls =
      lines.slice(0, 5).map(line => {
        try {
          return new URL(
            line,
            playlistBase
          ).href;
        } catch {
          return line;
        }
      });

    // 8. اختبار أول segment
    let segmentTest = null;

    if (segmentUrls.length > 0) {
      try {
        const segmentResponse =
          await fetch(
            segmentUrls[0],
            {
              headers: {
                "User-Agent": USER_AGENT,
                "Referer": REFERER,
                "Accept": "*/*"
              },
              cache: "no-store"
            }
          );

        segmentTest = {
          url: segmentUrls[0],
          status: segmentResponse.status,
          content_type:
            segmentResponse.headers.get(
              "content-type"
            ),
          content_length:
            segmentResponse.headers.get(
              "content-length"
            )
        };

      } catch (error) {
        segmentTest = {
          error: error.message
        };
      }
    }

    // 9. النتيجة
    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.status(200).json({
      success:
        playlistResponse.status === 200,

      channel_id:
        String(channelId),

      final_url:
        finalUrl,

      playlist_status:
        playlistResponse.status,

      playlist_content_type:
        playlistResponse.headers.get(
          "content-type"
        ),

      playlist_preview:
        playlistText.substring(0, 1000),

      segment_count:
        lines.length,

      first_segments:
        segmentUrls,

      segment_test:
        segmentTest
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      step: "ERROR",
      error: error.message
    });
  }
}
