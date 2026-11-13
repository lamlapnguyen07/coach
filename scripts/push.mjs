// 由 GitHub Actions 定時執行：送一則推播給手機，內容由手機上的 Service Worker 決定。
import webpush from 'web-push';

const raw = process.env.PUSH_CONFIG;
if (!raw) {
  console.error('找不到 PUSH_CONFIG。請到 Settings → Secrets and variables → Actions 新增，內容從 App 的設定頁複製。');
  process.exit(1);
}
const cfg = JSON.parse(raw);
const subject = 'https://github.com/' + (process.env.GITHUB_REPOSITORY || 'github');
webpush.setVapidDetails(subject, cfg.publicKey, cfg.privateKey);

try {
  const res = await webpush.sendNotification(cfg.subscription, JSON.stringify({ t: 'check' }), { TTL: 3600, urgency: 'high' });
  console.log('已送出，狀態碼', res.statusCode);
} catch (err) {
  console.error('送出失敗，狀態碼', err.statusCode, err.body || err.message);
  if (err.statusCode === 404 || err.statusCode === 410) {
    console.error('這組推播訂閱已失效。請在 App 設定頁按「重新產生推播設定」，再更新 PUSH_CONFIG。');
  }
  process.exit(1);
}
