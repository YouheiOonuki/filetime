// Q-365: まとめて変換の表の見出しを、画面のコード（main.js）を実際に走らせて数える。
// 名前のある貼り付けは 7 つ（左が「名前」/ Name）、名前の無い貼り付けは 6 つのまま。ja・en の両方。
// main.js は DOM を前提にするので、使う分だけの偽の document で vm の中に読み込む
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CALC_SRC = fs.readFileSync(path.join(ROOT, 'calc.js'), 'utf8');
const MAIN_SRC = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');

function fakeElement() {
  const handlers = {};
  return {
    value: '', innerHTML: '', textContent: '', options: [],
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    fire(type) { (handlers[type] || []).forEach((fn) => fn({ target: this })); },
    getAttribute() { return null; }, focus() {}
  };
}

// lang のページで main.js を走らせ、貼り付けを「変換」して、表の見出しの字を返す
function bulkHeaders(lang, pasted) {
  const els = {};
  const document = {
    documentElement: { lang },
    getElementById(id) { return (els[id] = els[id] || fakeElement()); },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const window = { YorozuScreen: { detailsSummary() {} } };
  const ctx = { window, document, location: { hash: '', href: 'https://example.test/' }, navigator: {}, localStorage: { getItem() { return null; }, setItem() {} }, Intl, Date, setTimeout, clearTimeout, BigInt, console };
  ctx.self = window;
  vm.createContext(ctx);
  vm.runInContext(CALC_SRC, ctx);
  if (!window.Calc) window.Calc = ctx.Calc;
  vm.runInContext(MAIN_SRC, ctx);
  els.bulk.value = pasted;
  els['bulk-run'].fire('click');
  const thead = els['bulk-result'].innerHTML.match(/<thead>(.*?)<\/thead>/);
  assert.ok(thead, `${lang}: 表が出ていない: ${els['bulk-result'].innerHTML.slice(0, 200)}`);
  return [...thead[1].matchAll(/<th>(.*?)<\/th>/g)].map((m) => m[1]);
}

const NAMED = ['"Name","SamAccountName","pwdLastSet"', '"Sato Ichiro","sato.i","134347122000000000"'].join('\r\n');
const UNNAMED = ['pwdLastSet: 134347122000000000', 'lastLogonTimestamp: 134340000000000000'].join('\n');

test('まとめて変換の見出し: 名前ありは 7 つで左が名前、名前なしは 6 つ（ja・en）', () => {
  for (const [lang, label] of [['ja', '名前'], ['en', 'Name']]) {
    const named = bulkHeaders(lang, NAMED);
    assert.equal(named.length, 7, `${lang} 名前あり: ${named}`);
    assert.equal(named[0], label, `${lang} 名前あり: 左の見出し`);
    const plain = bulkHeaders(lang, UNNAMED);
    assert.equal(plain.length, 6, `${lang} 名前なし: ${plain}`);
    assert.ok(!plain.includes(label), `${lang} 名前なし: 名前の見出しが無い`);
  }
});
