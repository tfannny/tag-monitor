/**
 * Patchright浏览器模式抓取模块
 *
 * 当普通fetch被Cloudflare WAF拦截时，使用patchright（Playwright反检测分支）
 * 模拟真实浏览器访问TAG官网，绕过Cloudflare人机验证（5秒盾/Turnstile），
 * 并在浏览器上下文内直接请求公告API。
 */
const crypto = require("crypto");

const DEFAULT_API_BASE = process.env.TAG_API_BASE || "https://user.tagss14.pro";

function hashContent(str) {
  return crypto.createHash("md5").update(str || "").digest("hex");
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const date = typeof ts === "number" && ts < 10000000000 ? new Date(ts * 1000) : new Date(ts);
  return date.toISOString().split("T")[0];
}

/**
 * 清理并规范化Token
 */
function normalizeToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return null;
  let token = rawToken.trim();
  if (token.startsWith("{") && token.endsWith("}")) {
    try {
      const parsed = JSON.parse(token);
      token = parsed.token || parsed.auth_data || parsed["tag:token"] || token;
    } catch {
      // ignore
    }
  }
  token = token.replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").trim();
  if (token === "your_token_here" || token.startsWith("your_") || token === "xxx") {
    return null;
  }
  return token || null;
}

/**
 * 使用Patchright浏览器绕过Cloudflare并获取公告
 */
async function fetchWithBrowser(options = {}) {
  const token = normalizeToken(options.token || process.env.TAG_TOKEN);
  const email = options.email || process.env.TAG_EMAIL;
  const password = options.password || process.env.TAG_PASSWORD;
  const apiBase = options.apiBase || process.env.TAG_API_BASE || DEFAULT_API_BASE;

  if (!token && (!email || !password)) {
    throw new Error(
      "未检测到TAG认证配置！请在.env或GitHub Secrets中配置TAG_TOKEN或TAG_EMAIL/TAG_PASSWORD。"
    );
  }

  let patchright;
  try {
    patchright = require("patchright");
  } catch {
    throw new Error(
      "未安装patchright依赖。请运行: npm install patchright"
    );
  }

  const isCI = !!process.env.CI;
  const launchOptions = {
    // 关键：Cloudflare对纯headless检测严格，使用headless: false配合xvfb（CI）或系统界面（本地）能瞬间通过
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1280,800"
    ]
  };

  if (!isCI) {
    launchOptions.channel = "chrome";
  }

  const modeLabel = isCI ? "Xvfb虚拟桌面+Chromium" : "系统Chrome";
  console.log(`[浏览器模式] 启动浏览器 (${modeLabel})...`);
  const browser = await patchright.chromium.launch(launchOptions);

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "zh-CN"
    });

    const page = await context.newPage();

    // 1. 访问官网登录页触发Cloudflare质询
    const targetUrl = `${apiBase}/#/login`;
    console.log(`[浏览器模式] 正在访问: ${targetUrl}`);
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch (e) {
      // Cloudflare盾刷新页面时可能抛出ERR_ABORTED，属正常现象
      console.log("[浏览器模式] 导航初始响应，等待盾质询完成...");
    }

    // 2. 循环检测Cloudflare验证状态
    //    只有看到真实的TAG官网页面标题("TAG Internet")才算真正通过
    //    GitHub Actions的数据中心IP可能触发更严格的Cloudflare质询，需要更长等待
    console.log("[浏览器模式] 正在等待Cloudflare验证通过...");
    let passed = false;
    const maxWait = 45; // 最多等待45秒（CI环境可能更慢）
    const CHALLENGE_TITLES = [
      "请稍候…", "Just a moment...", "Attention Required",
      "访问提示", "Access denied", "Checking your browser"
    ];

    for (let i = 0; i < maxWait; i++) {
      await page.waitForTimeout(1000);
      let title = "";
      try {
        title = await page.title();
      } catch {
        continue;
      }

      // 严格判定：标题必须是TAG官网的真实标题
      const isRealPage = title === "TAG Internet";
      // 宽松判定（作为备用）：既不是空也不是已知的质询/拦截页面标题
      const isDefinitelyChallenge = !title ||
        CHALLENGE_TITLES.some(ct => title.includes(ct)) ||
        title.startsWith("Loading ");

      if (isRealPage) {
        console.log(`[浏览器模式] Cloudflare验证已通过！(耗时 ${i + 1}s, 页面标题: "${title}")`);
        passed = true;
        break;
      }

      if (!isDefinitelyChallenge && i >= 15) {
        // 等了超过15秒且标题不是已知拦截页面，尝试当作通过
        console.log(`[浏览器模式] 检测到未知页面标题: "${title}"，尝试继续...`);
        passed = true;
        break;
      }

      if (i > 0 && i % 10 === 0) {
        console.log(`[浏览器模式] 仍在等待Cloudflare验证... (${i}s, 当前标题: "${title}")`);
      }
    }

    if (!passed) {
      const finalTitle = await page.title().catch(() => "unknown");
      throw new Error(`Cloudflare验证等待超时(${maxWait}s)，最终页面标题: "${finalTitle}"`);
    }

    // 等待SPA主元素加载完成
    await page.waitForTimeout(2000);

    // 3. 准备有效Token
    let activeToken = token;
    if (!activeToken && email && password) {
      console.log(`[浏览器模式] 未配置Token，尝试在浏览器内使用账号 ${email} 登录...`);
      const loginResult = await page.evaluate(async ({ email, password, apiBase }) => {
        const res = await fetch(`${apiBase}/api/v1/passport/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        return { status: res.status, data: await res.json() };
      }, { email, password, apiBase });

      activeToken = loginResult?.data?.data?.token || loginResult?.data?.data?.auth_data;
      if (!activeToken) {
        throw new Error(`浏览器模式登录失败: ${loginResult?.data?.message || "未知错误"}`);
      }
      console.log("[浏览器模式] 自动登录成功获取Token！");
    }

    // 4. 在已通过Cloudflare质询的浏览器页面内请求公告接口
    //    使用page.evaluate内的fetch确保完整携带浏览器的Cloudflare cookie/指纹
    console.log("[浏览器模式] 正在获取最新公告...");
    const appUrl = options.apiBase || apiBase;
    const noticeApiBase = options.apiBase || appUrl || apiBase;
    const noticeUrl = `${noticeApiBase}/api/v1/user/notice/fetch?current=1`;

    const noticeResult = await page.evaluate(async ({ noticeUrl, activeToken, appUrl }) => {
      try {
        const res = await fetch(noticeUrl, {
          headers: {
            "Authorization": activeToken,
            "Accept": "application/json, text/plain, */*",
            "Referer": `${appUrl}/`
          }
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const isCloudflare = text.includes("cloudflare") || text.includes("Just a moment") || text.includes("cf-chl");
          return { error: `HTTP ${res.status}`, status: res.status, isCloudflare };
        }
        return { ok: true, data: await res.json() };
      } catch (e) {
        return { error: e.message };
      }
    }, { noticeUrl, activeToken, appUrl });

    if (noticeResult.error) {
      throw new Error(`获取公告失败: ${noticeResult.error}${noticeResult.isCloudflare ? " (仍被Cloudflare拦截，浏览器可能未真正通过验证)" : ""}`);
    }

    const apiData = noticeResult.data;

    const rawList = Array.isArray(apiData?.data)
      ? apiData.data
      : (Array.isArray(apiData?.data?.data) ? apiData.data.data : []);

    const notices = rawList.map(item => {
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

    console.log(`[浏览器模式] 成功获取到 ${notices.length} 条公告！`);
    return { appUrl, notices };

  } finally {
    await browser.close();
    console.log("[浏览器模式] 浏览器已安全退出");
  }
}

module.exports = {
  fetchWithBrowser
};

// 命令行直接测试入口
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

  fetchWithBrowser()
    .then(({ appUrl, notices }) => {
      console.log(`\n=========================================`);
      console.log(`TAG最新官网地址: ${appUrl}`);
      console.log(`抓取到 ${notices.length} 条公告：`);
      console.log(`=========================================\n`);
      notices.forEach((n, i) => {
        const alertTag = n.alert ? " [弹窗重要]" : "";
        console.log(`[${i + 1}] [${n.date}]${alertTag} ${n.title} (ID: ${n.id})`);
        const cleanContent = (n.content || "").replace(/<[^>]+>/g, "").trim();
        console.log(`    正文摘要: ${cleanContent.slice(0, 100)}${cleanContent.length > 100 ? "..." : ""}`);
        console.log("");
      });
    })
    .catch(err => {
      console.error("\n❌ 浏览器模式测试失败:", err.message);
      process.exit(1);
    });
}
