// 変換ロジックのテスト: node --test tests/*.test.js
// （.github/workflows/test.yml で push・PR のたびに自動実行される）
// 既知の値は Microsoft Learn の例（KB 555936・How to Specify Comparison Values）と、定義から計算できる境目
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');
const CONSTANTS = require('../constants.js');

test('FILETIME → UTC: 定義の境目', () => {
  assert.equal(C.formatUtc(0n), '1601-01-01 00:00:00.0000000');
  assert.equal(C.formatUtc(116444736000000000n), '1970-01-01 00:00:00.0000000');
  assert.equal(C.formatUtc(116444736000000001n), '1970-01-01 00:00:00.0000001');
  assert.equal(C.formatUtc(9223372036854775807n), '30828-09-14 02:48:05.4775807');
  assert.equal(C.formatIso(116444736000000000n), '1970-01-01T00:00:00.0000000Z');
  assert.equal(C.formatUtc(-1n), '');
});

test('FILETIME → UTC: Microsoft Learn の例', () => {
  // KB 555936: w32tm /ntte 128271382742968750 → 05:57:54.2968750（GMT）、6/24/2007
  assert.equal(C.formatUtc(128271382742968750n), '2007-06-24 05:57:54.2968750');
  // How to Specify Comparison Values: (creationTime=125911583990000000) = 1999-12-31 23:59:59 UTC
  assert.equal(C.formatUtc(125911583990000000n), '1999-12-31 23:59:59.0000000');
});

test('UTC → FILETIME: 往復で桁を落とさない', () => {
  const r = C.parseDateTime('1999-12-31 23:59:59', 'UTC');
  assert.equal(r.ok, true);
  assert.equal(r.ticks, 125911583990000000n);
  const r2 = C.parseDateTime('2007-06-24T05:57:54.296875Z', 'Asia/Tokyo');
  assert.equal(r2.ticks, 128271382742968750n);
  const r3 = C.parseDateTime('2007-06-24T05:57:54.2968751Z');
  assert.equal(r3.ticks, 128271382742968751n);
  for (const t of [1n, 134000000000000000n, 134347122000000000n, 9223372036854775807n]) {
    const back = C.parseDateTime(C.formatIso(t), 'UTC');
    assert.equal(back.ticks, t, String(t));
  }
});

test('タイムゾーン: 日本時間・夏時間・オフセット指定', () => {
  const t = C.parseDateTime('2026-09-24 17:30', 'Asia/Tokyo').ticks;
  assert.equal(C.formatUtc(t), '2026-09-24 08:30:00.0000000');
  assert.equal(C.formatInZone(t, 'Asia/Tokyo').text, '2026-09-24 17:30:00.0000000');
  assert.equal(C.formatInZone(t, 'Asia/Tokyo').offset, '+09:00');
  // 夏時間（ニューヨーク 9 月は -04:00、1 月は -05:00）
  assert.equal(C.formatInZone(t, 'America/New_York').offset, '-04:00');
  const w = C.parseDateTime('2026-01-15 12:00', 'America/New_York').ticks;
  assert.equal(C.formatUtc(w), '2026-01-15 17:00:00.0000000');
  // 明示のオフセットはタイムゾーンの選択より優先
  assert.equal(C.parseDateTime('2026-09-24 17:30+09:00', 'America/New_York').ticks, t);
  assert.equal(C.parseDateTime('2026年9月24日 17時30分', 'Asia/Tokyo').ticks, t);
  // 夏時間で存在しない時刻（2026-03-08 02:30 ニューヨーク）は切り替え後にずらす
  const gap = C.parseDateTime('2026-03-08 02:30', 'America/New_York');
  assert.equal(gap.ok, true);
  assert.equal(C.formatInZone(gap.ticks, 'America/New_York').text.slice(11, 16), '03:30');
});

test('日時の入力の誤り', () => {
  assert.equal(C.parseDateTime('', 'UTC').error, 'empty');
  assert.equal(C.parseDateTime('2026-02-30', 'UTC').error, 'range');
  assert.equal(C.parseDateTime('1600-12-31 23:59:59', 'UTC').error, 'before1601');
  assert.equal(C.parseDateTime('tomorrow', 'UTC').error, 'format');
  assert.equal(C.isValidZone('Asia/Tokyo'), true);
  assert.equal(C.isValidZone('Mars/Olympus'), false);
});

test('数値の読み取り: カンマ・空白・16 進・範囲', () => {
  assert.equal(C.parseInteger('134,000,000,000,000,000'), 134000000000000000n);
  assert.equal(C.parseInteger(' 134 000 000 000 000 000 '), 134000000000000000n);
  assert.equal(C.parseInteger('0x1DC0A5E1F3A0000'), 0x1DC0A5E1F3A0000n);
  assert.equal(C.parseInteger('0x7FFFFFFFFFFFFFFF'), 9223372036854775807n);
  assert.equal(C.parseInteger('0x8000000000000000'), -9223372036854775808n);
  assert.equal(C.parseInteger('0xFFFFFFFFFFFFFFFF'), -1n);
  assert.equal(C.parseInteger('-36288000000000'), -36288000000000n);
  assert.equal(C.parseInteger('9223372036854775808'), null);          // 64 ビットを超える
  assert.equal(C.parseInteger('0x10000000000000000'), null);
  assert.equal(C.parseInteger('12a'), null);
  assert.equal(C.toHex64(-1n), '0xFFFFFFFFFFFFFFFF');
  assert.equal(C.toHex64(9223372036854775807n), '0x7FFFFFFFFFFFFFFF');
  assert.equal(C.groupDigits(134000000000000000n), '134,000,000,000,000,000');
});

test('Unix・.NET ticks・一般化時刻', () => {
  assert.equal(C.ticksToUnixSeconds(116444736000000000n), 0n);
  assert.equal(C.ticksToUnixSeconds(116444735999999999n), -1n);      // 切り捨て
  assert.equal(C.unixSecondsToTicks(1758702600), 134031762000000000n);
  assert.equal(C.ticksToUnixMs(134031762001234567n), 1758702600123n);
  assert.equal(C.unixMsToTicks(0), 116444736000000000n);
  // .NET: DateTime(1970,1,1).Ticks = 621355968000000000
  assert.equal(C.ticksToDotnet(116444736000000000n), 621355968000000000n);
  assert.equal(C.dotnetToTicks(621355968000000000n), 116444736000000000n);
  assert.equal(C.ticksToGeneralized(125911583990000000n), '19991231235959.0Z');
  assert.equal(C.parseGeneralized('19990323205258.0Z'), C.parseDateTime('1999-03-23 20:52:58', 'UTC').ticks);
  // ±hhmm は ISO 8601 のとおり地方時（+0200 の 06:00 は UTC 04:00）
  assert.equal(C.formatUtc(C.parseGeneralized('20010928060000.0+0200')), '2001-09-28 04:00:00.0000000');
  assert.equal(C.parseGeneralized('20260230000000.0Z'), null);
  assert.equal(C.ticksToGeneralized(9223372036854775807n), '');       // 9999 年より後
});

test('特別な値: 0・最大値・最小値・-1', () => {
  let r = C.interpret(0n, 'pwdLastSet');
  assert.equal(r.kind, 'zero'); assert.deepEqual(r.notes, ['pwdLastSetZero']);
  r = C.interpret(0n, 'accountExpires');
  assert.deepEqual(r.notes, ['accountExpiresZero']);
  r = C.interpret(9223372036854775807n, 'accountExpires');
  assert.equal(r.kind, 'never'); assert.deepEqual(r.notes, ['accountExpiresNever']);
  r = C.interpret(9223372036854775807n, 'msDS-UserPasswordExpiryTimeComputed');
  assert.deepEqual(r.notes, ['pwdExpiryNever']);
  r = C.interpret(9223372036854775807n, '');
  assert.deepEqual(r.notes, ['maxValue']);
  r = C.interpret(0n, 'lockoutTime');
  assert.deepEqual(r.notes, ['lockoutTimeZero']);
  r = C.interpret(-9223372036854775808n, 'maxPwdAge');
  assert.equal(r.kind, 'mininterval'); assert.deepEqual(r.notes, ['maxPwdAgeNever']);
  r = C.interpret(-1n, 'pwdLastSet');
  assert.equal(r.kind, 'negative');
  r = C.interpret(134000000000000000n, 'accountExpires');
  assert.ok(r.notes.includes('accountExpiresAduc'));
  r = C.interpret(134000000000000000n, 'lastLogonTimestamp');
  assert.ok(r.notes.includes('lastLogonTimestampLag'));
});

test('負の期間: maxPwdAge・lockoutDuration', () => {
  // 42 日 = 42 × 864000000000
  const r = C.interpret(-36288000000000n, 'maxPwdAge');
  assert.equal(r.kind, 'interval');
  assert.ok(r.notes.includes('maxPwdAgeHow'));
  const d = C.durationParts(-36288000000000n);
  assert.equal(d.days, 42n); assert.equal(d.h, 0); assert.equal(d.totalDays, 42);
  // [MS-SAMR] の例: 20 分 = -12000000000
  assert.equal(C.durationParts(-12000000000n).totalMinutes, 20);
  assert.equal(C.formatDuration(-18000000000n), '-0d 00:30:00');
  assert.equal(C.formatDuration(-36288000000001n), '-42d 00:00:00.0000001');
  assert.equal(C.interpret(-18000000000n, 'lockoutDuration').notes.includes('lockoutDurationHow'), true);
  assert.equal(C.interpret(-5n, '').notes[0], 'negativeAsInterval');
  assert.deepEqual(C.snippets(-36288000000000n, 'interval'), ['[TimeSpan]::FromTicks(36288000000000)']);
});

test('ADUC の表示日・経過日数・期限', () => {
  const t = C.parseDateTime('2026-10-01 00:00', 'Asia/Tokyo').ticks;   // ADUC で「2026/09/30 の終わり」を選んだ値
  assert.equal(C.aducEndOfDate(t, 'Asia/Tokyo'), '2026-09-30');
  const set = C.parseDateTime('2026-09-01 00:00', 'UTC').ticks;
  assert.equal(C.ageDays(set, Date.UTC(2026, 8, 11)), 10);
  assert.equal(C.formatUtc(C.addDays(set, 42)), '2026-10-13 00:00:00.0000000');
});

test('1 行の入力: 属性つきの行・自動判定', () => {
  let p = C.parseSingle('pwdLastSet : 134,000,000,000,000,000', 'auto', 'UTC');
  assert.equal(p.ok, true); assert.equal(p.attr, 'pwdLastSet'); assert.equal(p.ticks, 134000000000000000n); assert.equal(p.source, 'filetime');
  p = C.parseSingle('accountexpires=9223372036854775807', 'auto', 'UTC');
  assert.equal(p.attr, 'accountExpires'); assert.equal(p.value, 9223372036854775807n);
  p = C.parseSingle('lastLogonTimestamp: 0x01DC0A5E1F3A0000', 'auto', 'UTC');
  assert.equal(p.ticks, 0x01DC0A5E1F3A0000n);
  p = C.parseSingle('1758702600', 'auto', 'UTC');
  assert.equal(p.source, 'unix'); assert.equal(p.ticks, 134031762000000000n);
  p = C.parseSingle('1758702600123', 'auto', 'UTC');
  assert.equal(p.source, 'unixms');
  p = C.parseSingle('639000000000000000', 'dotnet', 'UTC');
  assert.equal(p.ticks, 639000000000000000n - 504911232000000000n);
  assert.equal(C.looksLikeDotnet(639000000000000000n), true);
  assert.equal(C.looksLikeDotnet(134000000000000000n), false);
  p = C.parseSingle('whenCreated : 20260924083000.0Z', 'auto', 'UTC');
  assert.equal(p.source, 'gentime'); assert.equal(C.formatUtc(p.ticks), '2026-09-24 08:30:00.0000000');
  p = C.parseSingle('2026-09-24 17:30', 'auto', 'Asia/Tokyo');
  assert.equal(p.source, 'datetime'); assert.equal(C.formatUtc(p.ticks), '2026-09-24 08:30:00.0000000');
  p = C.parseSingle('maxPwdAge : -36288000000000', 'auto', 'UTC');
  assert.equal(p.value, -36288000000000n);
  assert.equal(C.parseSingle('99999999999999999999', 'auto', 'UTC').error, 'int64');
  assert.equal(C.parseSingle('hello', 'auto', 'UTC').error, 'number');
  assert.equal(C.parseSingle('', 'auto', 'UTC').error, 'empty');
});

test('まとめて変換: Get-ADUser -Properties * の出力', () => {
  const text = [
    'accountExpires                       : 9223372036854775807',
    'badPasswordTime                      : 0',
    'badPwdCount                          : 0',
    'CN                                   : Taro Yamada',
    'logonCount                           : 42',
    'lastLogonTimestamp                   : 134340000000000000',
    'PasswordLastSet                      : 9/24/2026 5:30:00 PM',
    'pwdLastSet                           : 134347122000000000',
    'userAccountControl                   : 512',
    'uSNChanged                           : 123456',
    'whenCreated                          : 9/24/2026 5:30:00 PM',
    'msDS-SomethingNew                    : 134100000000000000'
  ].join('\r\n');
  const items = C.extractBulk(text);
  assert.deepEqual(items.map(i => i.attr), ['accountExpires', 'badPasswordTime', 'lastLogonTimestamp', 'pwdLastSet', 'msDS-SomethingNew']);
  assert.equal(items[0].value, 9223372036854775807n);
  assert.equal(items[3].line, 8);
  assert.equal(items[4].guessed, true);
});

test('まとめて変換: ldifde・csvde・名前=値・数値だけ', () => {
  const ldif = [
    'dn: CN=Taro Yamada,OU=Users,DC=contoso,DC=com',
    'changetype: add',
    'whenCreated: 20260924083000.0Z',
    'dSCorePropagationData: 16010101000000.0Z',
    'pwdLastSet: 134347122000000000',
    'objectGUID:: 3q2+7w==',
    'maxPwdAge: -36288000000000'
  ].join('\n');
  const a = C.extractBulk(ldif);
  assert.deepEqual(a.map(i => i.attr), ['whenCreated', 'dSCorePropagationData', 'pwdLastSet', 'maxPwdAge']);
  assert.equal(a[0].source, 'gentime');
  assert.equal(a[0].dn, 'CN=Taro Yamada,OU=Users,DC=contoso,DC=com');
  assert.equal(C.formatUtc(a[1].ticks), '1601-01-01 00:00:00.0000000');

  const csv = 'DN,sAMAccountName,pwdLastSet,lastLogonTimestamp,logonCount\n"CN=Taro,OU=Users,DC=contoso,DC=com",taro,134347122000000000,0,42\n"CN=Hanako,DC=contoso,DC=com",hanako,0,134340000000000000,3\n';
  const b = C.extractBulk(csv);
  assert.equal(b.length, 4);
  assert.equal(b[0].dn, 'CN=Taro,OU=Users,DC=contoso,DC=com');
  assert.deepEqual(b.map(i => i.attr), ['pwdLastSet', 'lastLogonTimestamp', 'pwdLastSet', 'lastLogonTimestamp']);

  const kv = C.extractBulk('accountExpires=0\nlockoutTime=134340000000000000');
  assert.equal(kv.length, 2);

  const nums = C.extractBulk('134347122000000000\n134340000000000000, 42, 512\nsee 0x01DC0A5E1F3A0000 here');
  assert.equal(nums.length, 3);
  assert.equal(nums[2].ticks, 0x01DC0A5E1F3A0000n);

  assert.equal(C.extractBulk('nothing here\nlogonCount : 42').length, 0);
  assert.equal(C.extractBulk('134347122000000000\n'.repeat(50), 10).length, 10);
});

test('共有リンク #v=', () => {
  assert.equal(C.toShareHash('134000000000000000', 'pwdLastSet'), '#v=134000000000000000&a=pwdLastSet');
  assert.deepEqual(C.fromShareHash('#v=134000000000000000&a=pwdLastSet'), { value: '134000000000000000', attr: 'pwdLastSet' });
  assert.deepEqual(C.fromShareHash('#v=0'), { value: '0', attr: '' });
  assert.equal(C.fromShareHash('#a=x'), null);
  assert.equal(C.fromShareHash('#v=1&a=<script>').attr, '');
  assert.equal(C.fromShareHash(''), null);
});

test('コマンド例（表示するだけ）', () => {
  const s = C.snippets(128271382742968750n, 'datetime');
  assert.equal(s[0], '[datetime]::FromFileTimeUtc(128271382742968750)');
  assert.equal(s[2], 'w32tm /ntte 128271382742968750');
  assert.equal(s[3], '[DateTime]::new(2007, 6, 24, 5, 57, 54, [DateTimeKind]::Utc).ToFileTimeUtc()');
});

test('constants: すべての値に出典と確認日がある', () => {
  for (const [key, c] of Object.entries(CONSTANTS)) {
    assert.ok(c.source && c.url && c.checked, `${key} に source / url / checked が無い`);
    assert.match(c.checked, /^\d{4}-\d{2}-\d{2}$/, `${key} の checked は YYYY-MM-DD`);
    assert.match(c.url, /^https:\/\/learn\.microsoft\.com\//, `${key} の url は Microsoft Learn`);
  }
});
