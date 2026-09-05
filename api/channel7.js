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
    const channelId = req.query.id || "4";

    // =========================================
    // 1. جلب بيانات القناة
    // =========================================

    const apiResponse = await fetch(
      `${API_BASE}/api/channel/${encodeURIComponent(channelId)}`,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "*/*"
        },
        cache: "no-store"
      }
    );

    if (!apiResponse.ok) {
      return res.status(502).json({
        success: false,
        step: "api",
        status: apiResponse.status,
        error: "فشل الاتصال بـ API"
      });
    }

    // =========================================
    // 2. قراءة Header t
    // =========================================

    const timestamp =
      apiResponse.headers.get("t") ||
      apiResponse.headers.get("T");

    if (!timestamp) {
      return res.status(502).json({
        success: false,
        step: "timestamp",
        error: "Header t غير موجود"
      });
    }

    // =========================================
    // 3. قراءة البيانات المشفرة
    // =========================================

    const encrypted = await apiResponse.text();

    // =========================================
    // 4. فك Base64 + XOR
    // =========================================

    const decrypted = decrypt(
      encrypted,
      XOR_KEY + timestamp
    );

    let data;

    try {
      data = JSON.parse(decrypted);
    } catch {
      return res.status(502).json({
        success: false,
        step: "decrypt",
        error: "فشل فك JSON"
      });
    }

    // =========================================
    // 5. استخراج الرابط
    // =========================================

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
      typeof redirectUrl !== "string" ||
      !redirectUrl.startsWith("http")
    ) {
      return res.status(404).json({
        success: false,
        step: "url",
        error: "لم يتم العثور على رابط القناة"
      });
    }

    // =========================================
    // 6. طلب الـ Redirect
    // =========================================

    const redirectResponse = await fetch(
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

    const finalUrl =
      redirectResponse.headers.get("location");

    if (!finalUrl) {
      return res.status(502).json({
        success: false,
        step: "redirect",
        redirect_status: redirectResponse.status,
        redirect_url: redirectUrl,
        error: "لم يتم الحصول على Location"
      });
    }

    // =========================================
    // 7. تحليل الرابط النهائي
    // =========================================

    let finalResponse;

    try {
      finalResponse = await fetch(
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
        step: "final_request",
        redirect_url: redirectUrl,
        final_url: finalUrl,
        error: error.message
      });
    }

    // =========================================
    // 8. قراءة معلومات الرابط النهائي
    // =========================================

    const status = finalResponse.status;

    const contentType =
      finalResponse.headers.get("content-type");

    const server =
      finalResponse.headers.get("server");

    const cfRay =
      finalResponse.headers.get("cf-ray");

    const cacheStatus =
      finalResponse.headers.get("cf-cache-status");

    // =========================================
    // 9. محاولة قراءة M3U8
    // =========================================

    let playlistPreview = "";

    if (
      status >= 200 &&
      status < 300
    ) {
      try {
        const text = await finalResponse.text();

        playlistPreview = text.substring(0, 500);
      } catch {
        playlistPreview = "";
      }
    }

    // =========================================
    // 10. تحديد حالة الرابط
    // =========================================

    let diagnosis;

    if (status === 200) {
      diagnosis =
        "الرابط يعمل والسيرفر يرجع HTTP 200";
    } else if (status === 403) {
      diagnosis =
        "السيرفر رفض الطلب HTTP 403";
    } else if (status === 404) {
      diagnosis =
        "الرابط غير موجود HTTP 404";
    } else if (status === 521) {
      diagnosis =
        "Cloudflare لا يستطيع الاتصال بالسيرفر الأصلي HTTP 521";
    } else if (status === 522) {
      diagnosis =
        "Cloudflare انتهت مهلة الاتصال بالسيرفر الأصلي HTTP 522";
    } else if (status === 523) {
      diagnosis =
        "Cloudflare لا يستطيع الوصول إلى Origin HTTP 523";
    } else {
      diagnosis =
        `السيرفر رجع HTTP ${status}`;
    }

    // =========================================
    // 11. منع التخزين المؤقت
    // =========================================

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    res.setHeader(
      "Expires",
      "0"
    );

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    // =========================================
    // 12. النتيجة
    // =========================================

    return res.status(200).json({
      success: status === 200,

      channel_id: String(channelId),

      redirect_url: redirectUrl,

      final_url: finalUrl,

      final_status: status,

      content_type: contentType,

      server: server,

      cloudflare_ray: cfRay,

      cloudflare_cache: cacheStatus,

      diagnosis: diagnosis,

      playlist_preview: playlistPreview
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      step: "server",
      error: error.message
    });
  }
}

بعد النشر افتح:

https://YOUR-DOMAIN.vercel.app/api/channel?id=4

مثلاً إذا ظهر:

{
  "final_status": 521,
  "diagnosis": "Cloudflare لا يستطيع الاتصال بالسيرفر الأصلي HTTP 521"
}

فالمشكلة من السيرفر الأصلي نفسه، وليس من JavaScript.

أما إذا ظهر:

{
  "final_status": 200,
  "content_type": "application/vnd.apple.mpegurl",
  "playlist_preview": "#EXTM3U..."
}

فالرابط يوصل فعلياً إلى الـM3U8، وساعتها نركز على المشغل أو طلبات الـsegments.
