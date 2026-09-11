# TAG 官网公告每日自动监测与邮件提醒

每天自动追踪 TAG 最新官网域名、检测最新公告，发现新增公告时自动发送精美 HTML 邮件提醒。

基于 **GitHub Actions** 全自动定时执行，零服务器成本，免受 Cloudflare / 极验滑块验证码干扰。

---

## 🌟 核心特性

1. **自动追踪动态域名**：自动检测 TAG 最新的官网地址（从动态 API 解析 `app_url`，告别域名失效迷路）。
2. **免打码 & 抗封锁**：针对 TAG 官网前端存在的牛猫 WAF (PoW) 算力盾、Cloudflare 5秒盾及登录页极验滑块（Geetest），采用底层 API 鉴权机制，秒级直达数据，极度稳定。
3. **精准增量比对 (Git-Scraping)**：历史公告自动持久化存储在仓库中，自动比对 ID / 标题，**仅在有全新公告发布时才触发邮件提醒**，绝不重复骚扰。
4. **精美邮件通知**：支持 QQ 邮箱、163 邮箱、Gmail、企业邮箱等任意 SMTP 邮箱，邮件包含标题、发布时间、正文排版及最新官网直达入口。
5. **支持一键手动测试**：GitHub Actions 支持 `workflow_dispatch`，随时在网页上一键手动运行测试。

---

## 🚀 快速使用步骤

### 第一步：获取你的 TAG 登录凭证 (Token)

由于 TAG 登录页面开启了**极验交互式滑块验证码 (Geetest)**，在 GitHub Actions 机房环境中无法自动滑块登录。最稳定、优雅的做法是复制一次长效 Token（有效期一般长达数月）：

1. 打开电脑浏览器，正常登录 TAG 官网。
2. 登录成功后，按键盘 **F12**（Mac 按 `Command + Option + I`）打开开发者工具。
3. 切换到 **Console（控制台）** 标签页。
4. 在控制台输入以下代码并按回车：
   ```javascript
   localStorage.getItem("auth_data")
   ```
5. 控制台输出的那串类似 `eyJ0eXAiOiJKV1QiLCJhbGci...fe99d816...` 的长字符串（不含外层双引号），就是你的 **Token**，复制保存。

---

### 第二步：将代码推送到你的 GitHub 私有仓库

1. 在 GitHub 上新建一个仓库（建议设为 **Private（私有仓库）**，保护你的公告数据与运行日志）。
2. 将本项目代码推送至 GitHub：
   ```bash
   git init
   git add .
   git commit -m "feat: initial tag monitor"
   git branch -M main
   git remote add origin https://github.com/你的用户名/你的仓库名.git
   git push -u origin main
   ```

---

### 第三步：配置 GitHub Secrets

在你的 GitHub 仓库页面：
1. 点击顶部 **Settings** -> 左侧 **Secrets and variables** -> **Actions**。
2. 点击 **New repository secret**，依次添加以下配置：

| Secret 名称 | 说明 | 示例值 | 必填 |
| :--- | :--- | :--- | :--- |
| `TAG_TOKEN` | 第一步中获取的 Token | `fe99d8167...e03444` | **是 (强烈推荐)** |
| `TAG_EMAIL` | 你的 TAG 账号邮箱（备用） | `user@gmail.com` | 否 |
| `TAG_PASSWORD`| 你的 TAG 账号密码（备用） | `your_password` | 否 |
| `SMTP_HOST` | 发信邮箱的 SMTP 服务器 | `smtp.qq.com` / `smtp.163.com` / `smtp.gmail.com` | **是** |
| `SMTP_PORT` | SMTP 端口 | `465` | **是** |
| `SMTP_USER` | 发信邮箱账号 | `123456789@qq.com` | **是** |
| `SMTP_PASS` | 邮箱授权码/应用专用密码 | *(在邮箱设置中开启 POP3/SMTP 得到的独立授权码)* | **是** |
| `NOTIFY_EMAIL`| 接收公告提醒的目标邮箱 | `receive@gmail.com` | **是** |
| `FIRST_RUN_NOTIFY` | 首次建立基线时是否强制推送最新一条测试邮件 | `true` 或 `false`（默认 false） | 否 |

> 💡 **邮箱授权码获取提示**：
> - **QQ 邮箱**：进入 QQ 邮箱网页版 -> 设置 -> 账户 -> 向下滚动找到 POP3/IMAP/SMTP 服务 -> 生成授权码。
> - **163 邮箱**：设置 -> POP3/SMTP/IMAP -> 开启 POP3/SMTP 服务 -> 新增授权密码。

---

### 第四步：启用工作流写入权限

为了让 GitHub Actions 能够把历史公告记录保存在仓库中以做增量比对：
1. 在仓库 **Settings** -> 左侧 **Actions** -> **General**。
2. 页面最下方找到 **Workflow permissions**。
3. 选择 **Read and write permissions**，点击 **Save**。

---

### 第五步：测试运行

1. 点击仓库顶部的 **Actions** 选项卡。
2. 在左侧选择 **Daily TAG Notice Monitor**。
3. 点击右侧 **Run workflow** -> 点击绿色按钮 **Run workflow** 手动触发一次。
4. 查看执行日志，若配置了 `FIRST_RUN_NOTIFY=true`，你将立即收到包含最新公告的测试邮件！

---

## ⏰ 定时调度说明

默认每天北京时间早上 **09:00**（对应 UTC 时间 01:00）自动执行检测。
如需调整时间，直接修改 `.github/workflows/daily_monitor.yml` 中的 cron 表达式：
```yaml
schedule:
  - cron: "0 1 * * *" # 分 时 日 月 周 (UTC 时间，北京时间需减去 8 小时)
```

---

## 📁 本地测试与开发

如果你想在本地机器上先跑一次测试：

1. 复制配置环境：
   ```bash
   cp .env.example .env
   # 编辑 .env 填入你的 Token 和 SMTP 信息
   ```
2. 安装依赖并执行：
   ```bash
   npm install
   node src/monitor.js
   ```
