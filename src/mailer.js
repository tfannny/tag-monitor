/**
 * 邮件发送模块
 */
const nodemailer = require("nodemailer");

function hasSmtpConfig() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure = process.env.SMTP_SECURE !== "false" && port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
}

function formatDate(timestamp) {
  if (!timestamp) return "未知时间";
  const date = typeof timestamp === "number" && timestamp < 10000000000
    ? new Date(timestamp * 1000)
    : new Date(timestamp);
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function renderHtmlTemplate(newNotices, latestUrl) {
  const noticesHtml = newNotices.map((n, idx) => {
    const timeStr = formatDate(n.created_at || n.date);
    const contentHtml = (n.content || "").replace(/\n/g, "<br/>");
    return `
      <div style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:20px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f3f4f6;padding-bottom:12px;margin-bottom:14px;">
          <h2 style="margin:0;font-size:18px;color:#111827;">#${idx + 1} ${n.title || "公告"}</h2>
          <span style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:4px 8px;border-radius:4px;">${timeStr}</span>
        </div>
        <div style="font-size:14px;line-height:1.6;color:#374151;word-break:break-word;">
          ${contentHtml}
        </div>
      </div>
    `;
  }).join("");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f9fafb;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="margin:0 0 8px 0;color:#1e3a8a;font-size:22px;">TAG最新公告提醒</h1>
        <p style="margin:0;color:#6b7280;font-size:13px;">本次检测发现 <strong>${newNotices.length}</strong> 条公告更新</p>
      </div>

      <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px 16px;margin-bottom:20px;border-radius:4px;font-size:13px;color:#1e40af;">
        <strong>TAG最新官网地址：</strong>
        <a href="${latestUrl}" target="_blank" style="color:#2563eb;text-decoration:underline;">
          ${latestUrl}
        </a>
      </div>

      ${noticesHtml}

      <div style="text-align:center;margin-top:30px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">
        TAG Notice Monitor
      </div>
    </div>
  `;
}

async function sendNoticeEmail(newNotices, latestUrl) {
  if (!newNotices || newNotices.length === 0) return;

  if (!hasSmtpConfig()) {
    console.warn("[邮件通知] 未检测到SMTP配置(SMTP_HOST, SMTP_USER, SMTP_PASS)，跳过发送邮件。");
    return;
  }

  const transporter = createTransporter();
  const to = process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
  const from = process.env.SMTP_FROM || `"TAG Notice Monitor" <${process.env.SMTP_USER}>`;

  const subject = newNotices.length === 1
    ? `[TAG公告] ${newNotices[0].title}`
    : `[TAG公告] 发现 ${newNotices.length} 条公告更新`;

  const html = renderHtmlTemplate(newNotices, latestUrl);

  const mailOptions = {
    from,
    to,
    subject,
    html
  };

  console.log(`正在发送邮件通知至 ${to} ...`);
  const info = await transporter.sendMail(mailOptions);
  console.log("邮件发送成功! MessageId:", info.messageId);
  return info;
}

module.exports = {
  hasSmtpConfig,
  sendNoticeEmail
};
