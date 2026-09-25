# TAG公告监控系统

运行在 GitHub Actions 上的 TAG 官网公告定时采集与邮件提醒工具。

## 工作原理

1. **动态追踪**：调用官方配置接口获取 TAG 当前最新跳转官网地址（`app_url`）。
2. **官方 API 采集**：通过官方用户接口（`/api/v1/user/notice/fetch`）直接获取官方最新公告列表与正文，包括弹窗公告与图文内容（已弃用旧第三方公告站 note.boccc.co）。
3. **增量比对**：与本地 `data/notices.json` 历史数据进行哈希比对。若检测到新公告发布或旧公告内容变更，立即通过 SMTP 发送邮件通知，并自动将更新数据提交推送回 GitHub 仓库。

## 部署步骤

### 1. 推送代码至 GitHub 私有仓库

```bash
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

### 2. 配置仓库 Secrets

在 GitHub 仓库中依次点击 **Settings -> Secrets and variables -> Actions -> New repository secret**，添加以下环境变量：

| Secret名称 | 说明 | 示例 | 必填 |
|:---|:---|:---|:---|
| **TAG_TOKEN** | TAG 官方登录凭证（**首选**） | `eyJhbGci...` | 是 (与账号密码二选一) |
| **TAG_EMAIL** | TAG 官网登录邮箱账号（备选） | `user@example.com` | 是 (未填Token时必填) |
| **TAG_PASSWORD** | TAG 官网登录密码（备选） | `your_password` | 是 (未填Token时必填) |
| **SMTP_HOST** | 发信 SMTP 服务器 | `smtp.qq.com` | 是 |
| **SMTP_PORT** | SMTP 端口（通常为 465） | `465` | 是 |
| **SMTP_USER** | 发信邮箱账号 | `user@qq.com` | 是 |
| **SMTP_PASS** | 发信邮箱授权码/密码 | `abcdefghijklmnop` | 是 |
| **NOTIFY_EMAIL** | 接收通知的目标邮箱 | `receiver@example.com` | 是 |
| **FIRST_RUN_NOTIFY** | 首次运行是否发送最新公告测试邮件 | `true` 或 `false` | 否 |

> **如何获取 TAG_TOKEN？**
> 1. 用电脑浏览器登录 TAG 官网面板；
> 2. 按 `F12`（或右键“检查”）打开开发者工具，切换到 **Console (控制台)**；
> 3. 输入以下代码回车：
>    ```javascript
>    localStorage.getItem("token") || localStorage.getItem("tag:token")
>    ```
> 4. 复制返回的字符串，粘贴到 `TAG_TOKEN` 即可。

### 3. 开启 Actions 读写权限

在 GitHub 仓库中依次点击 **Settings -> Actions -> General**，在页面底部的 **Workflow permissions** 区域选择 **Read and write permissions** 并保存，以确保工作流能够将数据更新提交回仓库。

### 4. 运行测试

在 GitHub 仓库的 **Actions** 页面中，点击左侧 **Daily TAG Notice Monitor**，点击右侧 **Run workflow** 手动触发运行。

## 定时说明

工作流默认在每天北京时间 09:00 (UTC 01:00) 自动执行。如需调整时间，直接修改 `.github/workflows/daily_monitor.yml` 中的 cron 表达式。

## 本地运行

本地环境需 Node.js (>= 18)。

```bash
npm install
cp .env.example .env
# 编辑 .env 填入 TAG 认证信息及 SMTP 信息
node src/monitor.js
```
