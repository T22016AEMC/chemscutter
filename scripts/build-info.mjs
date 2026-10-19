// 建置資訊：建置時間（台灣時間）與 git commit 短雜湊，供 vite.config.ts 以 define 注入首頁。
// 取不到 commit 時（例如不在 git 目錄）顯示 unknown。
import { execSync } from 'node:child_process';

export function getBuildInfo() {
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown';
  } catch {
    const sha = process.env.GITHUB_SHA;
    if (sha) commit = sha.slice(0, 7);
  }
  const buildTime =
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date()) + '（UTC+8）';
  return { commit, buildTime };
}
