# TAG公告监控系统

基于GitHub Actions实现的TAG官网公告定时采集与邮件提醒工具。

## 工作原理

1. 调用配置接口获取TAG当前最新的官网跳转地址。
2. 抓取官方公告站(note.boccc.co)的文章列表与正文内容。
3. 对比本地data/notices.json历史数据。若检测到新增文章或文章内容更新，通过SMTP发送邮件提醒，并将更新后的数据自动提交推送至GitHub仓库。

## 部署步骤

### 1. 推送代码至GitHub私有仓库

创建GitHub私有仓库，在本地终端执行以下命令推送代码：

```bash
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

### 2. 配置仓库Secrets

在GitHub仓库中依次点击Settings->Secrets and variables->Actions->New repository secret，添加以下环境变量：

|Secret名称|说明|示例|必填|
|:---|:---|:---|:---|
|SMTP_HOST|发信SMTP服务器|smtp.qq.com|是|
|SMTP_PORT|SMTP端口(通常为465)|465|是|
|SMTP_USER|发信邮箱账号|user@qq.com|是|
|SMTP_PASS|发信邮箱授权码|abcdefghijklmnop|是|
|NOTIFY_EMAIL|接收通知的目标邮箱|receiver@example.com|是|
|FIRST_RUN_NOTIFY|首次运行是否发送最新公告测试邮件|true或false|否|

### 3. 开启Actions读写权限

在GitHub仓库中依次点击Settings->Actions->General，在页面底部的Workflow permissions区域选择Read and write permissions并保存，以确保工作流能够将数据更新提交回仓库。

### 4. 运行测试

在GitHub仓库的Actions页面中，点击左侧Daily TAG Notice Monitor，点击右侧Run workflow手动触发运行。

## 定时说明

工作流默认在每天北京时间09:00(UTC 01:00)自动执行。如需调整时间，直接修改.github/workflows/daily_monitor.yml中的cron表达式。

## 本地运行

本地环境需Node.js(>=18)。

```bash
npm install
cp .env.example .env
# 编辑.env填入SMTP信息
node src/monitor.js
```
