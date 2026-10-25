const crypto = require("crypto");

/**
 * TAG 官网公告与最新域名抓取模块
 *
 * TAG 官方已放弃旧公告站 (note.boccc.co)，将公告迁移至官网面板内。
 * 本模块直接对接官方最新 API 接口：
 * 1. 动态获取官方最新跳转域名 (/api/v1/guest/comm/config)
 * 2. 通过 Token 或账号密码登录后获取官网最新公告 (/api/v1/user/notice/fetch)
 */

const DEFAULT_API_BASE = process.env.TAG_API_BASE || "https://user.tagss14.pro";

/**
 * 解析并清理 Token
 */
function normalizeToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return null;
  let token = rawToken.trim();

  // 如果用户复制了 JSON 字符串，尝试解析提取 token
  if (token.startsWith("{") && token.endsWith("}")) {
    try {
      const parsed = JSON.parse(token);
      token = parsed.token || parsed.auth_data || parsed["tag:token"] || token;
    } catch {
      // ignore
    }
  }

  // 去除可能携带的 Bearer 前缀和引号
  token = token.replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").trim();
  if (token === "your_token_here" || token.startsWith("your_") || token === "xxx") {
    return null;
  }
  return token || null;
}

/**
 * 获取最新前端官网地址与配置
 */
async function getSiteConfig(apiBase = DEFAULT_API_BASE) {
  try {
    const url = `${apiBase}/api/v1/guest/comm/config`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_UA
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      return { appUrl: apiBase };
    }

    const json = await res.json();
    const appUrl = json?.data?.app_url || apiBase;
    return { appUrl, raw: json?.data };
  } catch (err) {
    return { appUrl: apiBase };
  }
}

/**
 * 使用账号密码登录获取 Token
 */
async function loginWithCredentials(email, password, apiBase = DEFAULT_API_BASE) {
  const url = `${apiBase}/api/v1/passport/auth/login`;
  console.log(`正在使用账号 ${email} 尝试登录官方 API...`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    },
    body: JSON.stringify({ email, password })
  });

  const json = await res.json();
  const token = json?.data?.token || json?.data?.auth_data;
  if (!res.ok || !token) {
    const errMsg = json?.message || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(`账号密码登录失败: ${errMsg}`);
  }

  return token;
}

/**
 * 计算内容哈希，用于检测文章内容的增量修改
 */
function hashContent(str) {
  return crypto.createHash("md5").update(str || "").digest("hex");
}

/**
 * 格式化时间戳
 */
const DEFAULT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

/**
 * 解析并清理 Cookie
 */
function normalizeCookie(rawCookie) {
  if (!rawCookie || typeof rawCookie !== "string") return null;
  let cookie = rawCookie.trim().replace(/^["']|["']$/g, "");
  if (!cookie || cookie === "your_cookie_here") return null;
  if (!cookie.includes("=")) {
    cookie = `cf_clearance=${cookie}`;
  }
  return cookie;
}

/**
 * 格式化时间戳
 */
function formatTimestamp(ts) {
  if (!ts) return "";
  const date = typeof ts === "number" && ts < 10000000000 ? new Date(ts * 1000) : new Date(ts);
  return date.toISOString().split("T")[0];
}

/**
 * 从官方 API 获取公告列表
 */
async function fetchOfficialNotices(token, targetUrl = DEFAULT_API_BASE, appUrl = "https://tagxx.vip", options = {}) {
  const url = `${targetUrl}/api/v1/user/notice/fetch?current=1`;
  console.log(`正在请求官方公告接口: ${url} ...`);

  const headers = {
    "Authorization": token,
    "User-Agent": DEFAULT_UA,
    "Accept": "application/json, text/plain, */*",
    "Referer": `${appUrl}/`
  };

  if (options.cookie) {
    headers["Cookie"] = options.cookie;
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000)
  });

  if (res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => "");
    if (text.includes("Just a moment...") || text.includes("cf-chl-") || text.includes("cloudflare") || text.includes("cf-mitigated")) {
      throw new Error(
        "CLOUDFLARE_BLOCKED: 请求被 Cloudflare 人机安全质询拦截 (403 WAF)！\n" +
        "由于官方接口启用了 Cloudflare 防护，请在 GitHub 仓库 Secrets (或 .env) 中配置 TAG_COOKIE。\n" +
        "获取方法：登录官网后在控制台执行 document.cookie，或在 Application -> Cookies 中复制 cf_clearance 的值。"
      );
    }
    throw new Error("AUTH_EXPIRED: Token 认证失效或已过期 (401/403)");
  }

  if (!res.ok) {
    throw new Error(`官方公告接口请求失败: HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const rawList = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.data?.data) ? json.data.data : []);

  return rawList.map(item => {
    const id = String(item.id);
    const title = (item.title || "最新公告").trim();
    const content = (item.content || "").trim();
    const imgUrl = item.img_url || null;
    const createdAt = item.created_at || Math.floor(Date.now() / 1000);
    const updatedAt = item.updated_at || createdAt;

    return {
      id,
      title,
      content,
      img_url: imgUrl,
      created_at: createdAt,
      updated_at: updatedAt,
      date: formatTimestamp(createdAt),
      url: `${appUrl}/#/notice`,
      alert: item.alert === 1,
      contentHash: hashContent(`${title}::${content}::${imgUrl || ""}`)
    };
  });
}

/**
 * 获取公告（统一入口）
 *
 * 优先使用普通fetch请求API；若被Cloudflare WAF拦截，
 * 自动降级为Playwright浏览器模式绕过验证。
 */
async function fetchNotices(options = {}) {
  const customApiBase = options.apiBase || process.env.TAG_API_BASE;
  let token = normalizeToken(options.token || process.env.TAG_TOKEN);
  const cookie = normalizeCookie(options.cookie || process.env.TAG_COOKIE || process.env.TAG_CF_CLEARANCE);
  const email = options.email || process.env.TAG_EMAIL;
  const password = options.password || process.env.TAG_PASSWORD;

  // 1. 获取最新官网跳转地址
  const { appUrl } = await getSiteConfig(customApiBase || DEFAULT_API_BASE);
  console.log(`[动态域名追踪] 当前 TAG 最新官网地址为: ${appUrl}`);

  // 2. 确定公告请求的 API 域名：若未手动指定 TAG_API_BASE，则优先使用动态获取到的真实官网域名 appUrl
  const noticeApiBase = customApiBase || appUrl || DEFAULT_API_BASE;

  // 3. 如果未配置 Token 但有账号密码，自动登录获取
  if (!token && email && password) {
    console.log("未检测到 TAG_TOKEN，尝试使用 TAG_EMAIL / TAG_PASSWORD 登录获取 Token...");
    token = await loginWithCredentials(email, password, customApiBase || DEFAULT_API_BASE);
    console.log("登录成功，已自动获得有效 Token！");
  }

  if (!token) {
    throw new Error(
      "未检测到 TAG 认证配置！\n" +
      "TAG 官方已废弃旧公告站，最新公告现已迁移至官网面板内，需认证访问。\n" +
      "请配置以下任一环境变量：\n" +
      "1. TAG_TOKEN (推荐): 登录官网后打开浏览器控制台(F12 Console)，运行 localStorage.getItem('token') 或 localStorage.getItem('tag:token') 复制；\n" +
      "2. TAG_EMAIL 与 TAG_PASSWORD: 官网登录账号密码，脚本将自动登录获取 Token。"
    );
  }

  // 4. 请求官方公告接口 (带自动重试与备用网关机制)
  let notices;
  try {
    notices = await fetchOfficialNotices(token, noticeApiBase, appUrl, { cookie });
  } catch (err) {
    if (err.message && err.message.includes("CLOUDFLARE_BLOCKED") && noticeApiBase !== DEFAULT_API_BASE) {
      console.warn("当前域名被 Cloudflare 拦截，尝试使用备用网关重试...");
      try {
        notices = await fetchOfficialNotices(token, DEFAULT_API_BASE, appUrl, { cookie });
      } catch {
        // 备用网关也被拦截，降级到浏览器模式
      }
    } else if (err.message && err.message.includes("AUTH_EXPIRED") && email && password) {
      console.warn("当前 Token 已失效，正在尝试使用账号密码重新登录...");
      token = await loginWithCredentials(email, password, customApiBase || DEFAULT_API_BASE);
      try {
        notices = await fetchOfficialNotices(token, noticeApiBase, appUrl, { cookie });
      } catch {
        // 重新登录后仍被拦截，降级到浏览器模式
      }
    }

    // 5. 所有普通fetch方式均失败，降级到Playwright浏览器模式
    if (!notices && err.message && err.message.includes("CLOUDFLARE_BLOCKED")) {
      console.warn("\n⚠️ 所有普通请求均被Cloudflare拦截，正在降级为浏览器模式...");
      try {
        const { fetchWithBrowser } = require("./browser-fetcher");
        const result = await fetchWithBrowser({ token, email, password, apiBase: customApiBase });
        console.log(`[公告抓取成功] 通过浏览器模式成功获取到 ${result.notices.length} 条官方公告`);
        return result;
      } catch (browserErr) {
        console.error("[浏览器模式] 降级失败:", browserErr.message);
        throw new Error(
          `普通请求被Cloudflare拦截，浏览器模式也失败。\n` +
          `原始错误: ${err.message}\n` +
          `浏览器错误: ${browserErr.message}`
        );
      }
    }

    if (!notices) throw err;
  }

  console.log(`[公告抓取成功] 成功获取到 ${notices.length} 条官方公告`);
  return {
    appUrl,
    notices
  };
}

module.exports = {
  DEFAULT_API_BASE,
  getSiteConfig,
  loginWithCredentials,
  fetchOfficialNotices,
  fetchNotices
};

// 如果直接运行 node src/fetcher.js，则执行连通性测试并打印最新公告
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(envPath);
    } else {
      fs.readFileSync(envPath, "utf-8").split("\n").forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const idx = trimmed.indexOf("=");
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) process.env[key] = val;
        }
      });
    }
  }

  fetchNotices()
    .then(({ appUrl, notices }) => {
      console.log(`\n=========================================`);
      console.log(`当前 TAG 最新官网地址: ${appUrl}`);
      console.log(`抓取到 ${notices.length} 条公告：`);
      console.log(`=========================================\n`);
      notices.forEach((n, i) => {
        const alertTag = n.alert ? " [弹窗重要]" : "";
        console.log(`[${i + 1}] [${n.date}]${alertTag} ${n.title} (ID: ${n.id})`);
        const cleanContent = (n.content || "").replace(/<[^>]+>/g, "").trim();
        console.log(`    正文摘要: ${cleanContent.slice(0, 100)}${cleanContent.length > 100 ? "..." : ""}`);
        if (n.img_url) console.log(`    配图地址: ${n.img_url}`);
        console.log("");
      });
    })
    .catch(err => {
      console.error("\n❌ 测试失败:", err.message);
      process.exit(1);
    });
}
