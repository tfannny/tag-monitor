/**
 * 监控主程序入口
 */
const path = require("path");
const { fetchNotices } = require("./fetcher");
const { sendNoticeEmail } = require("./mailer");

const DATA_DIR = path.resolve(__dirname, "../data");
const HISTORY_FILE = path.join(DATA_DIR, "notices.json");

/**
 * 读取本地历史公告
 */
function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn("读取历史数据异常，重置为空:", err.message);
    return [];
  }
}

/**
 * 写入最新公告至本地持久化文件
 */
function writeHistory(notices) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(notices, null, 2), "utf-8");
}

/**
 * 比较新旧公告，找出新增项
 */
function diffNotices(latestNotices, oldNotices) {
  const oldIds = new Set(oldNotices.map(n => String(n.id || n.title)));
  const newNotices = latestNotices.filter(n => !oldIds.has(String(n.id || n.title)));
  return newNotices;
}

async function main() {
  console.log("=========================================");
  console.log(`[TAG Monitor] 开始运行: ${new Date().toISOString()}`);
  console.log("=========================================");

  const token = process.env.TAG_TOKEN;
  const email = process.env.TAG_EMAIL;
  const password = process.env.TAG_PASSWORD;

  // 1. 获取最新公告列表及最新跳转域名
  const { appUrl, notices } = await fetchNotices({ token, email, password });
  console.log(`成功抓取到 ${notices.length} 条公告数据`);

  // 2. 比对历史数据
  const history = readHistory();
  const isFirstRun = history.length === 0;

  if (isFirstRun) {
    console.log("检测到首次运行，正在建立历史基线数据...");
    writeHistory(notices);

    // 如果指定了首次运行也推送最新一条
    if (process.env.FIRST_RUN_NOTIFY === "true" && notices.length > 0) {
      console.log("FIRST_RUN_NOTIFY=true，将推送最新一条公告测试...");
      await sendNoticeEmail([notices[0]], appUrl);
    } else {
      console.log("已保存基线公告数据，后续出现新公告时将自动发送邮件通知。");
    }
    return;
  }

  const newNotices = diffNotices(notices, history);

  if (newNotices.length === 0) {
    console.log("今日监测完成：未发现新增公告。");
    // 更新历史记录顺序或内容微调
    writeHistory(notices);
    return;
  }

  console.log(`🎉 发现 ${newNotices.length} 条全新公告！`);
  newNotices.forEach(n => console.log(`- [${n.created_at || "New"}] ${n.title}`));

  // 3. 发送邮件通知
  await sendNoticeEmail(newNotices, appUrl);

  // 4. 持久化存储
  writeHistory(notices);
  console.log("历史数据已更新，监控任务顺利完成。");
}

main().catch(err => {
  console.error("❌ 任务执行出错:", err);
  process.exit(1);
});
