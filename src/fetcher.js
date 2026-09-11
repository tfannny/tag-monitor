/**
 * TAG 公告与最新域名抓取模块
 */

// 默认 API 网关（无 Cloudflare 拦截，响应极快）
const DEFAULT_API_BASE = process.env.TAG_API_BASE || "https://3lcjqnejlt8iz5iq.tagss-verification.org";

/**
 * 获取最新前端官网地址与配置
 */
async function getSiteConfig(apiBase = DEFAULT_API_BASE) {
  const url = `${apiBase}/api/v1/guest/comm/config`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    }
  });

  if (!res.ok) {
    throw new Error(`获取配置失败: HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const appUrl = json?.data?.app_url || "https://tagxx.vip";
  return {
    appUrl,
    raw: json?.data
  };
}

/**
 * 使用账号密码尝试直接登录
 */
async function loginWithCredentials(email, password, apiBase = DEFAULT_API_BASE) {
  const url = `${apiBase}/api/v1/passport/auth/login`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    },
    body: JSON.stringify({ email, password })
  });

  const json = await res.json();
  if (!res.ok || !json.data?.token) {
    const errMsg = json.message || "登录失败";
    throw new Error(`账号密码登录失败: ${errMsg}`);
  }

  return json.data.token;
}

/**
 * 获取公告列表
 */
async function fetchNotices({ token, email, password, apiBase = DEFAULT_API_BASE }) {
  let authToken = token;

  // 如果未直接提供 Token，但提供了账号密码，尝试登录获取
  if (!authToken && email && password) {
    console.log("未检测到 TAG_TOKEN，尝试使用 TAG_EMAIL 和 TAG_PASSWORD 登录...");
    try {
      authToken = await loginWithCredentials(email, password, apiBase);
      console.log("账号密码登录成功，已获取临时 Token！");
    } catch (err) {
      console.error(err.message);
      throw new Error(
        "无法通过账号密码自动登录（站点可能启用了极验人机滑块验证码）。\n" +
        "建议：请在浏览器中登录一次 TAG，打开控制台/应用存储复制 auth_data Token 并配置到 TAG_TOKEN 中！"
      );
    }
  }

  if (!authToken) {
    throw new Error("请配置 TAG_TOKEN 或 TAG_EMAIL + TAG_PASSWORD！");
  }

  // 1. 获取最新官网地址
  let appUrl = "https://tagxx.vip";
  try {
    const config = await getSiteConfig(apiBase);
    appUrl = config.appUrl;
    console.log(`[动态域名追踪] 当前 TAG 最新官网地址为: ${appUrl}`);
  } catch (e) {
    console.warn("获取最新 app_url 异常，使用备用地址:", e.message);
  }

  // 2. 请求用户公告接口
  const noticeUrl = `${apiBase}/api/v1/user/notice/fetch`;
  const res = await fetch(noticeUrl, {
    headers: {
      "Authorization": authToken,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    }
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Token 认证失败或已过期 (401/403)，请重新在浏览器登录并更新 TAG_TOKEN！");
  }

  if (!res.ok) {
    throw new Error(`获取公告失败: HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const notices = json.data || [];

  return {
    appUrl,
    notices
  };
}

module.exports = {
  getSiteConfig,
  loginWithCredentials,
  fetchNotices
};
