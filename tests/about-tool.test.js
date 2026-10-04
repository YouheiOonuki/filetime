// 画面の末尾の「この道具について」（yorozu-plans の docs/WRITING.md 1 章。2026-10-04 AdSense 再審査の厚み）
// 字数は tools/writing/measure.py と同じ数え方（タグを除き、空白を除いた文字数）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<details[^>]*id="about-tool"[^>]*>[\s\S]*?<\/details>/);

function textLength(s) {
  const t = s.replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, 'x')
    .replace(/\s+/g, '');
  return t.length;
}

test('「この道具について」の折りたたみが、結果と保存の後（使い方へのリンクより前）にある', () => {
  assert.ok(m, 'details#about-tool が無い');
  assert.match(m[0], /<summary>この道具について（使い方・計算のしくみ・注意）<\/summary>/);
  assert.ok(html.indexOf('id="about-tool"') > html.indexOf('id="opt-bulk"'), '「くわしく入れる」より後');
  assert.ok(html.indexOf('id="about-tool"') > html.indexOf('id="result"'), '結果より後');
});

test('「この道具について」は 400〜800 字、h3 は 4 つまで', () => {
  const n = textLength(m[0]);
  assert.ok(n >= 400 && n <= 800, `${n} 字`);
  const h3 = (m[0].match(/<h3/g) || []).length;
  assert.ok(h3 >= 1 && h3 <= 4, `h3 ${h3}`);
});

test('使い方ページへのリンクは 1 つ、関連の道具へのリンクは 3 つまで', () => {
  const hrefs = [...m[0].matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
  assert.equal(hrefs.filter((h) => h === './guide.html').length, 1);
  const others = hrefs.filter((h) => h !== './guide.html');
  assert.ok(others.length <= 3, others.join(' '));
  others.forEach((h) => assert.match(h, /^\.\.\/[A-Za-z0-9-]+\/$/, h));   // サイト内のツールのトップだけ
});

test('「この道具について」に書いた保存のキーは、main.js が使う接頭辞と一致する', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /KEY_PREFIX = 'filetime_'/);
  assert.match(main, /store\.set\('tz'/);
  assert.match(m[0], /filetime_tz/);
});
