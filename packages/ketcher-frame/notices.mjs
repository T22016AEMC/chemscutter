import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 隨發布產物附上 lockfile 內正式相依的授權與原始聲明，不提交產物。
const lock = JSON.parse(readFileSync(new URL('./package-lock.json', import.meta.url), 'utf8'));
const sections = ['第三方套件聲明\nKetcher 3.18.0：https://github.com/epam/ketcher/tree/v3.18.0\nApache-2.0 全文見 LICENSE，官方聲明見 NOTICE。\n套件原始碼未修改；本整合以 Vite 編譯並設定 events 別名與 globalThis 對應。'];
for (const [directory, entry] of Object.entries(lock.packages)) {
  if (!directory || entry.dev) continue;
  const root = resolve(import.meta.dirname, directory);
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const files = readdirSync(root).filter((name) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name));
  sections.push(`\n${pkg.name}@${pkg.version}\n授權：${pkg.license || '詳見套件聲明'}\n${files.map((name) => `${name}\n${readFileSync(resolve(root, name), 'utf8')}`).join('\n')}`);
}
writeFileSync(new URL('../../dist/ketcher/THIRD-PARTY-NOTICES.txt', import.meta.url), sections.join('\n\n'));
