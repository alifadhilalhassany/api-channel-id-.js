const API_BASE = "https://def.yacinelive.com";
const XOR_KEY = "c!xZj+N9&G@Ev@vw";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/139.0.0.0 Safari/537.36";

const REFERER = "https://x.com/";

function decrypt(base64, key) {
  const buffer = Buffer.from(
    base64.trim(),
    "base64"
  );

  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    output += String.fromCharCode(
      buffer[i] ^
      key.charCodeAt(i % key.length)
    );
  }

  return output;
}

export default async function handler(req, res) {

  try {

    const channelId =
      req.query?.id || "4";

    // ================================
    // API
    // ================================

    const apiUrl =
      `${API_BASE}/api/channel/${encodeURIComponent(channelId)}`;

    const apiResponse = await fetch(
      apiUrl,
      {
        method: "GET",

        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "*/*"
        },

        cache: "no-store"
      }
    );

    const encrypted =
      await apiResponse.text();

    if (!apiResponse.ok) {

      return res.status(200).json({
        success: false,
        step: "API",
        status: apiResponse.status,
        error: encrypted.substring(0, 300)
      });

    }

    // ================================
    // Header t
    // ================================

    const timestamp =
      apiResponse.headers.get("t");

    if (!timestamp) {

      return res.status(200).json({
        success: false,
        step: "HEADER",
        error: "Header t غير موجود"
      });

    }

    // ================================
    // فك التشفير
    // ================================

    let decrypted;

    try {

      decrypted = decrypt(
        encrypted,
        XOR_KEY + timestamp
      );

    } catch (error) {

      return res.status(200).json({
        success: false,
        step: "DECRYPT",
        error: error.message
      });

    }

    // ================================
    // JSON
    // ================================

    let data;

    try {

      data = JSON.parse(
        decrypted
      );

    } catch (error) {

      return res.status(200).json({
        success: false,
        step: "JSON",
        error: error.message,
        preview: decrypted.substring(0, 300)
      });

    }

    // ================================
    // استخراج الرابط
    // ================================

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

    if (
      typeof redirectUrl !== "string"
    ) {

      return res.status(200).json({
        success: false,
        step: "URL",
        error: "لم يتم العثور على رابط",
        data: data
      });

    }

    // ================================
    // Redirect
    // ================================

    let redirectResponse;

    try {

      redirectResponse =
        await fetch(
          redirectUrl,
          {
            method: "GET",

            redirect: "manual",

            headers: {
              "User-Agent": USER_AGENT,
              "Referer": REFERER,
              "Accept": "*/*"
            },

            cache: "no-store"
          }
        );

    } catch (error) {

      return res.status(200).json({
        success: false,
        step: "REDIRECT",
        url: redirectUrl,
        error: error.message
      });

    }

    const finalUrl =
      redirectResponse.headers.get(
        "location"
      );

    if (!finalUrl) {

      return res.status(200).json({
        success: false,
        step: "LOCATION",
        status: redirectResponse.status,
        url: redirectUrl,
        error: "السيرفر لم يرجع Location"
      });

    }

    // ================================
    // اختبار الرابط النهائي
    // ================================

    let finalResponse;

    try {

      finalResponse =
        await fetch(
          finalUrl,
          {
            method: "GET",

            redirect: "manual",

            headers: {
              "User-Agent": USER_AGENT,
              "Referer": REFERER,
              "Accept": "*/*"
            },

            cache: "no-store"
          }
        );

    } catch (error) {

      return res.status(200).json({
        success: false,
        step: "FINAL_REQUEST",
        final_url: finalUrl,
        error: error.message
      });

    }

    // ================================
    // Headers
    // ================================

    const contentType =
      finalResponse.headers.get(
        "content-type"
      );

    const server =
      finalResponse.headers.get(
        "server"
      );

    const cfRay =
      finalResponse.headers.get(
        "cf-ray"
      );

    // ================================
    // النتيجة
    // ================================

    let diagnosis;

    if (
      finalResponse.status === 200
    ) {

      diagnosis =
        "الرابط النهائي يرجع HTTP 200";

    } else if (
      finalResponse.status === 403
    ) {

      diagnosis =
        "السيرفر رفض الطلب HTTP 403";

    } else if (
      finalResponse.status === 521
    ) {

      diagnosis =
        "Cloudflare لا يستطيع الوصول إلى Origin - HTTP 521";

    } else if (
      finalResponse.status === 522
    ) {

      diagnosis =
        "Cloudflare timeout - HTTP 522";

    } else if (
      finalResponse.status === 523
    ) {

      diagnosis =
        "Cloudflare لا يستطيع الوصول إلى Origin - HTTP 523";

    } else {

      diagnosis =
        `HTTP ${finalResponse.status}`;

    }

    // ================================
    // CORS + Cache
    // ================================

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    // ================================
    // Response
    // ================================

    return res.status(200).json({

      success:
        finalResponse.status === 200,

      channel_id:
        String(channelId),

      redirect_url:
        redirectUrl,

      final_url:
        finalUrl,

      final_status:
        finalResponse.status,

      content_type:
        contentType,

      server:
        server,

      cloudflare_ray:
        cfRay,

      diagnosis:
        diagnosis

    });

  } catch (error) {

    return res.status(200).json({

      success: false,

      step: "UNKNOWN",

      error:
        error?.message ||
        String(error),

      stack:
        error?.stack ||
        null

    });

  }

}
