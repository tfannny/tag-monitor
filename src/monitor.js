/**
 * 监控主程序入口
 */
const fs = require("fs");
const path = require("path");
const { fetchNotices } = require("./fetcher");
const { sendNoticeEmail, hasSmtpConfig } = require("./mailer");

const DATA_DIR = path.resolve(__dirname, "../data");
const HISTORY_FILE = path.join(DATA_DIR, "notices.json");

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

function writeHistory(notices) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(notices, null, 2), "utf-8");
}

function diffNotices(latestNotices, oldNotices) {
  const oldMap = new Map();
  for (const item of oldNotices) {
    oldMap.set(String(item.id), item);
  }

  const changed = [];
  for (const item of latestNotices) {
    const old = oldMap.get(String(item.id));
    if (!old) {
      changed.push({
        ...item,
        isUpdate: false
      });
    } else if (item.contentHash && old.contentHash && item.contentHash !== old.contentHash) {
      changed.push({
        ...item,
        isUpdate: true
      });
    }
  }

  return changed;
}

async function main() {
  console.log("=========================================");
  console.log(`[TAG Monitor] 开始运行: ${new Date().toISOString()}`);
  console.log("=========================================");

  // 1. 获取最新公告列表及最新跳转域名
  const { appUrl, notices } = await fetchNotices();

  // 2. 比对历史数据
  const history = readHistory();
  const isFirstRun = history.length === 0;

  if (isFirstRun) {
    console.log("检测到首次运行，正在建立历史基线数据...");
    writeHistory(notices);

    if (process.env.FIRST_RUN_NOTIFY === "true" && notices.length > 0) {
      console.log("FIRST_RUN_NOTIFY=true，正在发送测试通知邮件...");
      await sendNoticeEmail([notices[0]], appUrl);
    } else {
      console.log("已保存基线公告数据，后续出现新公告或内容变更时将触发通知。");
    }
    return;
  }

  const changedNotices = diffNotices(notices, history);

  if (changedNotices.length === 0) {
    console.log("今日检测完成：未发现新增或修改的公告。");
    writeHistory(notices);
    return;
  }

  console.log(`检测到 ${changedNotices.length} 条公告更新：`);
  changedNotices.forEach(n => {
    const tag = n.isUpdate ? "[内容更新]" : "[全新发布]";
    console.log(`- ${tag} [${n.date || "最新"}] ${n.title} (${n.url})`);
  });

  // 3. 发送邮件通知
  await sendNoticeEmail(changedNotices, appUrl);

  // 4. 持久化存储
  writeHistory(notices);
  console.log("历史数据已更新，监控任务完成。");
}

main().catch(err => {
  console.error("任务执行出错:", err);
  process.exit(1);
});
