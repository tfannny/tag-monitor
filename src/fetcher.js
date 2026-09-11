const crypto = require("crypto");
/**
 * TAG 公告与最新域名抓取模块
 * 
 * 经过深度逆向 TAG 前端与网络通信，TAG 官方维护了独立的公开公告站点: https://note.boccc.co/
 * 官方前端 /#/notice 实际挂载并跳转的正是该站点。
 * 同时通过开放 API 接口实时提取当前最新跳转的官网地址 (app_url)。
 */

const DEFAULT_API_BASE = process.env.TAG_API_BASE || "https://3lcjqnejlt8iz5iq.tagss-verification.org";
const NOTICE_SITE_BASE = process.env.TAG_NOTICE_URL || "https://note.boccc.co";

/**
 * 获取最新前端官网地址与配置
 */
async function getSiteConfig(apiBase = DEFAULT_API_BASE) {
  try {
    const url = `${apiBase}/api/v1/guest/comm/config`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
      }
    });

    if (!res.ok) {
      return { appUrl: "https://tagxx.vip" };
    }

    const json = await res.json();
    const appUrl = json?.data?.app_url || "https://tagxx.vip";
    return { appUrl, raw: json?.data };
  } catch (err) {
    console.warn("获取动态官网地址失败，使用默认地址:", err.message);
    return { appUrl: "https://tagxx.vip" };
  }
}

/**
 * 计算内容哈希，用于检测文章内容的增量修改
 */
function hashContent(str) {
  return crypto.createHash("md5").update(str || "").digest("hex");
}

/**
 * 从官方公开公告站抓取最新公告列表与正文
 */
async function fetchNoticesFromNoteSite() {
  console.log(`正在访问官方公告站: ${NOTICE_SITE_BASE} ...`);
  const res = await fetch(`${NOTICE_SITE_BASE}/`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    }
  });

  if (!res.ok) {
    throw new Error(`公告站访问失败: HTTP ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const postRegex = /<div class="post-item">\s*<a href="([^"]+)">([^<]+)<\/a><time datetime="([^"]+)"[^>]*>([^<]+)<\/time>\s*<\/div>/g;
  let match;
  const notices = [];

  while ((match = postRegex.exec(html)) !== null) {
    const [_, link, title, datetime, dateStr] = match;
    const idMatch = link.match(/archives\/(\d+)\.html/);
    const id = idMatch ? idMatch[1] : link;

    // 获取每篇公告的正文内容
    let content = "";
    try {
      const artRes = await fetch(link, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        }
      });
      const artHtml = await artRes.text();
      const mainMatch = artHtml.match(/<main>([\s\S]*?)<\/main>/);
      if (mainMatch) {
        content = mainMatch[1]
          .replace(/<header[\s\S]*?<\/header>/gi, "")
          .replace(/<footer[\s\S]*?<\/footer>/gi, "")
          .trim();
      }
    } catch (e) {
      content = `获取公告详情失败: ${e.message}`;
    }

    notices.push({
      id,
      title: title.trim(),
      url: link,
      date: dateStr.trim(),
      created_at: new Date(datetime).getTime() / 1000,
      content,
      contentHash: hashContent(content)
    });
  }

  return notices;
}

/**
 * 抓取公告（统一对外接口）
 */
async function fetchNotices() {
  // 1. 获取 TAG 最新的跳转域名
  const { appUrl } = await getSiteConfig();
  console.log(`[动态域名追踪] 当前 TAG 最新官网地址为: ${appUrl}`);

  // 2. 抓取公告详情
  const notices = await fetchNoticesFromNoteSite();
  console.log(`[公告抓取成功] 成功获取到 ${notices.length} 条公告`);

  return {
    appUrl,
    notices
  };
}

module.exports = {
  getSiteConfig,
  fetchNotices
};
