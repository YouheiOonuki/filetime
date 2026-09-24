// ===========================
// FILETIME・LDAP タイムスタンプ変換 — 画面の制御（日本語 / 英語のページで共通）
// 計算は calc.js（純粋関数）。文言はこのファイルの STR に日英で持ち、<html lang> で選ぶ
// 入力した値はどこにも送信しない。保存するのは「表示するタイムゾーン」の選択だけ（filetime_tz）
// ===========================
(function () {
  'use strict';

  var C = window.Calc;
  var LANG = document.documentElement.lang === 'en' ? 'en' : 'ja';

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  var KEY_PREFIX = 'filetime_';
  var store = {
    get: function (name, fallback) {
      try { var v = localStorage.getItem(KEY_PREFIX + name); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    }
  };

  // --- 文言 ---
  var STR = {
    ja: {
      weekdays: ['日', '月', '火', '水', '木', '金', '土'],
      utc: 'UTC（協定世界時）', local: 'この端末', zone: '選んだタイムゾーン', iso: 'ISO 8601（UTC）',
      ftDec: 'FILETIME（10 進）', ftHex: 'FILETIME（16 進）', unix: 'Unix 秒', unixms: 'Unix ミリ秒',
      dotnet: '.NET DateTime.Ticks', gen: '一般化時刻（whenCreated の形）', rel: '今から',
      duration: '期間', durationDays: '日数', totalMinutes: '分に直すと',
      daysAgo: '{n} 日前', daysLater: '{n} 日後', days: '{n} 日', minutes: '{n} 分',
      tooFar: '（9999 年より後は表せません）',
      read: { filetime: 'FILETIME（LDAP の Integer8）として読みました', unix: 'Unix 秒として読みました', unixms: 'Unix ミリ秒として読みました', dotnet: '.NET DateTime.Ticks として読みました', gentime: '一般化時刻として読みました', datetime: '日時として読みました' },
      attrPrefix: '属性: ',
      dotnetHint: 'もし .NET の DateTime.Ticks なら: {d} UTC（上の「数値の種類」で切り替えられます）',
      err: {
        empty: '数値を入れてください。', number: '数値として読めませんでした。10 進・16 進（0x…）・日時（2026-09-24 08:30）・一般化時刻（20260924083000.0Z）が使えます。',
        int64: '64 ビット符号付き整数の範囲（-9223372036854775808〜9223372036854775807）を超えています。桁が多すぎないか確かめてください。',
        range: '日時として表せる範囲を超えています。', format: '日時の形を読めませんでした（例: 2026-09-24 08:30:00）。',
        before1601: '1601 年 1 月 1 日（UTC）より前は FILETIME で表せません。', gentime: '一般化時刻の形を読めませんでした（例: 20260924083000.0Z）。'
      },
      notes: {
        accountExpiresNever: '<strong>無期限</strong>（期限なし）。9223372036854775807（0x7FFFFFFFFFFFFFFF）はアカウント作成時の既定値で、期限を一度も設定していないアカウントはこの値です。日時に直すと 30828 年になりますが、日付としての意味はありません。',
        accountExpiresZero: '<strong>無期限</strong>（期限なし）。一度期限を設定したアカウントを「無期限」に戻すと 0 になります（作成時からの無期限は 9223372036854775807）。',
        accountExpiresAduc: '「Active Directory ユーザーとコンピューター」（ADUC）は、この値の<strong>1 日前</strong>を「期限: 次の日の終わり」として表示します（この端末の時刻で <strong>{aduc}</strong> の終わり）。値そのものは「その日の 0 時を過ぎたら期限切れ」の時刻です。',
        pwdExpiryNever: '<strong>パスワードは期限切れにならない</strong>。「パスワードを無期限にする」・スマートカード必須・コンピューターや信頼関係のアカウント、またはドメインの最大有効期間が無期限のとき、この値になります。',
        pwdExpiryZero: '0 は、pwdLastSet が 0（次回ログオン時に変更が必要）か未設定のときの値です。',
        pwdExpiryDate: 'パスワードの有効期限（pwdLastSet ＋ 最大有効期間。細かい設定の PSO があればそちらの値）。',
        maxValue: '64 ビット符号付き整数の<strong>最大値</strong>（0x7FFFFFFFFFFFFFFF）。日時としては 30828-09-14 ですが、AD では「期限なし」の印として使われます（accountExpires・msDS-UserPasswordExpiryTimeComputed など）。',
        pwdLastSetZero: '<strong>次回ログオン時にパスワードの変更が必要</strong>（「ユーザーは次回ログオン時にパスワード変更が必要」にチェック）。ただし「パスワードを無期限にする」が立っているアカウントは除きます。',
        pwdLastSetMinusOne: '-1 は書き込み用の値で、「次回ログオン時の変更は不要」を表します（PowerShell などで pwdLastSet に -1 を書くと、変更が必要な状態を外せます）。',
        pwdLastSetAge: '最後にパスワードを設定してから <strong>{age}</strong>。',
        lockoutTimeZero: '<strong>ロックアウトされていない</strong>。',
        neverRecorded: '0 は「記録なし」（一度もログオンしていない、またはこの DC には記録がない）。',
        zeroGeneric: '0 は日時としては 1601-01-01 00:00:00 UTC。AD では「未設定・なし」の意味で使われることがほとんどです。',
        intervalZero: '期間 0。ポリシーでは「なし」の意味で使われます。',
        intervalNegative: '負の値は<strong>期間</strong>です（100 ナノ秒単位の負の数）。',
        negativeAsInterval: '負の値のため、日時ではなく<strong>期間</strong>として表示しています。',
        maxPwdAgeHow: 'maxPwdAge は負の値で持ちます。パスワードの期限 ＝ pwdLastSet ＋ |maxPwdAge|。',
        lockoutDurationHow: 'lockoutDuration は負の値で持ちます（ロックアウトが自動で解除されるまでの時間）。',
        maxPwdAgeNever: '-9223372036854775808（0x8000000000000000）は、最大有効期間が<strong>無期限</strong>（パスワードが期限切れにならない）の印です。',
        minValue: '64 ビット符号付き整数の<strong>最小値</strong>（0x8000000000000000）。期間の値では「無期限」の印として使われます。',
        intervalPositive: 'この属性はふつう負の値（期間）です。正の値のため日時として表示しています。',
        lastLogonTimestampLag: 'lastLogonTimestamp は正確な最終ログオンではありません。前の値が「今 − msDS-LogonTimeSyncInterval（既定 14 日）」より古いときだけ書き換わるため、既定では<strong>9〜14 日ほど遅れる</strong>ことがあります。使い道は休眠アカウントの洗い出しです。',
        lastLogonPerDc: 'lastLogon は DC ごとの値で、ほかの DC に複製されません。本当の最終ログオンは、全 DC の lastLogon のうち最も新しいものです。'
      },
      pwdExpiry: 'パスワードの期限（最大有効期間 {d} 日として）', aducRow: 'ADUC の表示（期限: 次の日の終わり）',
      copied: 'コピーしました', copyFail: 'コピーできませんでした。選択してコピーしてください。',
      shareDone: 'この値を開くリンクをコピーしました（値はリンクの # 以降に入り、サーバーには送られません）。',
      bulkCount: '{n} 件を変換しました', bulkNone: '変換できる値が見つかりませんでした。「属性名 : 値」の行（Get-ADUser -Properties * の出力など）か、18 桁の数を貼り付けてください。',
      bulkHead: ['行', '属性', '値', 'UTC', '選んだタイムゾーン', '意味'], guessed: '（属性不明・FILETIME とみなした）',
      bulkLimit: '先頭 {n} 件だけ表示しています。',
      filterNote: 'LDAP フィルターの例（この日時より前）', now: '今',
      loadedShare: '共有リンクの値を表示しています。'
    },
    en: {
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      utc: 'UTC', local: 'This device', zone: 'Selected time zone', iso: 'ISO 8601 (UTC)',
      ftDec: 'FILETIME (decimal)', ftHex: 'FILETIME (hex)', unix: 'Unix seconds', unixms: 'Unix milliseconds',
      dotnet: '.NET DateTime.Ticks', gen: 'Generalized time (whenCreated format)', rel: 'Relative to now',
      duration: 'Duration', durationDays: 'Days', totalMinutes: 'In minutes',
      daysAgo: '{n} days ago', daysLater: 'in {n} days', days: '{n} days', minutes: '{n} minutes',
      tooFar: '(not representable after year 9999)',
      read: { filetime: 'Read as FILETIME (LDAP Integer8)', unix: 'Read as Unix seconds', unixms: 'Read as Unix milliseconds', dotnet: 'Read as .NET DateTime.Ticks', gentime: 'Read as generalized time', datetime: 'Read as a date and time' },
      attrPrefix: 'Attribute: ',
      dotnetHint: 'If this is a .NET DateTime.Ticks value: {d} UTC (switch "Value type" above).',
      err: {
        empty: 'Enter a value.', number: 'Could not read that as a number. Use decimal, hex (0x…), a date (2026-09-24 08:30) or generalized time (20260924083000.0Z).',
        int64: 'Outside the signed 64-bit range (-9223372036854775808 to 9223372036854775807). Check for extra digits.',
        range: 'Outside the range that can be shown as a date.', format: 'Could not read that date (example: 2026-09-24 08:30:00).',
        before1601: 'Dates before 1601-01-01 UTC cannot be expressed as FILETIME.', gentime: 'Could not read that generalized time (example: 20260924083000.0Z).'
      },
      notes: {
        accountExpiresNever: '<strong>Never expires.</strong> 9223372036854775807 (0x7FFFFFFFFFFFFFFF) is the default when an account is created, so an account that was never given an end date has this value. As a date it would be in the year 30828, which is meaningless here.',
        accountExpiresZero: '<strong>Never expires.</strong> An account that once had an end date and was set back to "Never" gets 0 (an account that never had one keeps 9223372036854775807).',
        accountExpiresAduc: 'Active Directory Users and Computers shows <strong>one day earlier</strong> as "End of": on this device that is the end of <strong>{aduc}</strong>. The stored value is the moment the account expires (midnight at the start of the next day).',
        pwdExpiryNever: '<strong>The password never expires.</strong> You get this value when "Password never expires" or "Smart card is required" is set, for computer and trust accounts, or when the domain\'s maximum password age is unlimited.',
        pwdExpiryZero: '0 means pwdLastSet is 0 (must change password at next logon) or not set.',
        pwdExpiryDate: 'When the password expires (pwdLastSet + maximum password age, or the fine-grained PSO value if one applies).',
        maxValue: 'The <strong>largest</strong> signed 64-bit value (0x7FFFFFFFFFFFFFFF). As a date it is 30828-09-14, but AD uses it as a "never" marker (accountExpires, msDS-UserPasswordExpiryTimeComputed).',
        pwdLastSetZero: '<strong>User must change password at next logon</strong>, unless the account has "Password never expires" set.',
        pwdLastSetMinusOne: '-1 is a value you write, not one you read: writing -1 to pwdLastSet clears "must change password at next logon".',
        pwdLastSetAge: 'Password last set <strong>{age}</strong>.',
        lockoutTimeZero: '<strong>Not locked out.</strong>',
        neverRecorded: '0 means "no record": the account has never logged on, or not through this DC.',
        zeroGeneric: 'As a date, 0 is 1601-01-01 00:00:00 UTC. In AD it almost always means "not set".',
        intervalZero: 'A zero-length interval. In a policy it usually means "none".',
        intervalNegative: 'A negative value is an <strong>interval</strong> (a negative count of 100-nanosecond units).',
        negativeAsInterval: 'Negative, so it is shown as an <strong>interval</strong> rather than a date.',
        maxPwdAgeHow: 'maxPwdAge is stored as a negative number. Password expiry = pwdLastSet + |maxPwdAge|.',
        lockoutDurationHow: 'lockoutDuration is stored as a negative number: how long a locked-out account stays locked before it unlocks by itself.',
        maxPwdAgeNever: '-9223372036854775808 (0x8000000000000000) means the maximum password age is <strong>unlimited</strong> (passwords never expire).',
        minValue: 'The <strong>smallest</strong> signed 64-bit value (0x8000000000000000). In interval attributes it is used as an "unlimited" marker.',
        intervalPositive: 'This attribute is normally negative (an interval). The value is positive, so it is shown as a date.',
        lastLogonTimestampLag: 'lastLogonTimestamp is not an exact last logon. It is only updated when the stored value is older than now minus msDS-LogonTimeSyncInterval (14 days by default), so it can be <strong>9 to 14 days behind</strong>. Use it to find stale accounts.',
        lastLogonPerDc: 'lastLogon is kept separately on each domain controller and is not replicated. The real last logon is the newest lastLogon across all DCs.'
      },
      pwdExpiry: 'Password expires (with a maximum age of {d} days)', aducRow: 'ADUC shows (End of)',
      copied: 'Copied', copyFail: 'Could not copy. Please select and copy the text.',
      shareDone: 'Link copied. The value is after the # in the link, so it is never sent to a server.',
      bulkCount: 'Converted {n} values', bulkNone: 'No convertible values found. Paste "attribute : value" lines (such as Get-ADUser -Properties * output) or 18-digit numbers.',
      bulkHead: ['Line', 'Attribute', 'Value', 'UTC', 'Selected time zone', 'Meaning'], guessed: '(unknown attribute, treated as FILETIME)',
      bulkLimit: 'Showing the first {n} values.',
      filterNote: 'LDAP filter examples (earlier than this time)', now: 'Now',
      loadedShare: 'Showing the value from a shared link.'
    }
  };
  var T = STR[LANG];
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return o[k] !== undefined ? o[k] : ''; }); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function par(x) { return LANG === 'ja' ? '（' + x + '）' : ' (' + x + ')'; }

  // --- タイムゾーン ---
  var LOCAL_TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
  var FALLBACK_ZONES = ['UTC', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Dubai',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Honolulu'];
  var zones;
  try { zones = Intl.supportedValuesOf('timeZone').slice(); } catch (e) { zones = FALLBACK_ZONES.slice(); }
  if (zones.indexOf('UTC') < 0) zones.unshift('UTC');
  var tzSel = $('tz');
  var savedTz = store.get('tz', null);
  var tz = C.isValidZone(savedTz) ? savedTz : (LANG === 'ja' ? 'Asia/Tokyo' : 'America/New_York');
  if (zones.indexOf(tz) < 0) zones.push(tz);
  tzSel.innerHTML = zones.map(function (z) { return '<option value="' + esc(z) + '">' + esc(z) + '</option>'; }).join('');
  tzSel.value = tz;
  tzSel.addEventListener('change', function () {
    if (!C.isValidZone(tzSel.value)) return;
    tz = tzSel.value; store.set('tz', tz);
    renderSingle(); renderReverse(); if (lastBulk) renderBulk();
  });

  function zoneText(ticks, zone) {
    var z = C.formatInZone(ticks, zone);
    if (!z) return '';
    return z.text + ' (' + T.weekdays[z.weekday] + ') UTC' + z.offset;
  }
  function relText(ticks) {
    var d = C.ageDays(ticks, Date.now());
    var n = Math.abs(d) >= 100 ? Math.round(Math.abs(d)).toLocaleString(LANG) : (Math.round(Math.abs(d) * 10) / 10).toLocaleString(LANG);
    return fmt(d >= 0 ? T.daysAgo : T.daysLater, { n: n });
  }

  // --- 数値 → 日時 ---
  var el = {
    input: $('value'), mode: $('mode'), attr: $('attr'), out: $('result'), maxAge: $('max-age'),
    rin: $('dt'), rout: $('reverse-result'), bulk: $('bulk'), bout: $('bulk-result'), msg: $('msg')
  };

  function row(label, value, copy) {
    return '<tr><th scope="row">' + esc(label) + '</th><td><span class="v">' + esc(value) + '</span>' +
      (copy ? ' <button type="button" class="copy" data-copy="' + esc(value) + '">' + (LANG === 'ja' ? 'コピー' : 'Copy') + '</button>' : '') + '</td></tr>';
  }

  function renderSingle() {
    var text = el.input.value;
    if (!text.trim()) { el.out.hidden = true; el.out.innerHTML = ''; return; }
    var p = C.parseSingle(text, el.mode.value, tz);
    var attr = el.attr.value || p.attr || '';
    if (!p.ok) { el.out.hidden = false; el.out.innerHTML = '<p class="error">' + esc(T.err[p.error] || T.err.number) + '</p>'; return; }
    var html = '<p class="small read">' + esc(T.read[p.source]) + (attr ? ' ・ ' + esc(T.attrPrefix + attr) : '') + '</p>';
    var ticks = p.ticks;
    var info = p.source === 'filetime' ? C.interpret(p.value, attr) : { kind: 'datetime', ticks: ticks, notes: [] };
    var noteVals = {};
    if (info.kind === 'datetime' && attr.toLowerCase() === 'accountexpires') noteVals.aduc = C.aducEndOfDate(ticks, LOCAL_TZ);
    if (info.kind === 'datetime' && attr.toLowerCase() === 'pwdlastset') noteVals.age = relText(ticks);
    if (info.notes.length) {
      html += '<div class="notes">' + info.notes.map(function (k) { return '<p>' + fmt(T.notes[k], noteVals) + '</p>'; }).join('') + '</div>';
    }
    html += '<table class="result-table"><tbody>';
    if (info.kind === 'interval' || info.kind === 'mininterval' || info.kind === 'negative') {
      if (info.kind === 'interval') {
        var dp = C.durationParts(ticks);
        html += row(T.duration, C.formatDuration(ticks).replace(/^-/, ''), false);
        html += row(T.durationDays, fmt(T.days, { n: (Math.round(dp.totalDays * 10000) / 10000).toLocaleString(LANG) }), false);
        html += row(T.totalMinutes, fmt(T.minutes, { n: (Math.round(dp.totalMinutes * 100) / 100).toLocaleString(LANG) }), false);
      }
      html += row(T.ftDec, String(p.value), true);
      html += row(T.ftHex, C.toHex64(p.value), true);
    } else {
      html += row(T.utc, zoneText(ticks, 'UTC'), true);
      html += row(T.local + par(LOCAL_TZ), zoneText(ticks, LOCAL_TZ), true);
      html += row(T.zone + par(tz), zoneText(ticks, tz), true);
      if (info.kind === 'datetime') {
        html += row(T.iso, C.formatIso(ticks), true);
        if (attr.toLowerCase() === 'accountexpires' && noteVals.aduc) html += row(T.aducRow, noteVals.aduc, false);
        if (attr.toLowerCase() === 'pwdlastset') {
          var days = Number(el.maxAge.value);
          if (days > 0 && days <= 999) {
            var exp = C.addDays(ticks, days);
            html += row(fmt(T.pwdExpiry, { d: days }), zoneText(exp, tz) + ' / ' + relText(exp), false);
          }
        }
        html += row(T.rel, relText(ticks), false);
      }
      html += row(T.ftDec, String(ticks) + (ticks >= 1000n ? '  (' + C.groupDigits(ticks) + ')' : ''), false);
      html += row(T.ftHex, C.toHex64(ticks), true);
      if (info.kind === 'datetime') {
        html += row(T.unix, String(C.ticksToUnixSeconds(ticks)), true);
        html += row(T.unixms, String(C.ticksToUnixMs(ticks)), true);
        html += row(T.dotnet, String(C.ticksToDotnet(ticks)), true);
        var g = C.ticksToGeneralized(ticks);
        html += row(T.gen, g || T.tooFar, !!g);
      }
    }
    html += '</tbody></table>';
    if (p.source === 'filetime' && C.looksLikeDotnet(p.value)) {
      html += '<p class="small">' + esc(fmt(T.dotnetHint, { d: C.formatUtc(C.dotnetToTicks(p.value)) })) + '</p>';
    }
    var sn = C.snippets(info.kind === 'datetime' || info.kind === 'never' || info.kind === 'zero' ? ticks : info.ticks, info.kind);
    if (sn.length) {
      html += '<details class="snippets"><summary>' + (LANG === 'ja' ? 'PowerShell・コマンドで確かめる（表示するだけ。実行はしません）' : 'Check it in PowerShell or cmd (shown as text only; nothing runs here)') + '</summary><pre>' + esc(sn.join('\n')) + '</pre></details>';
    }
    html += '<p class="actions"><button type="button" class="btn" id="share">' + (LANG === 'ja' ? 'この値を開くリンクをコピー' : 'Copy a link to this value') + '</button></p>';
    // README「ツールを追加するとき」21: 結果の直後に 1 行だけ
    html += '<p class="next">' + (LANG === 'ja'
      ? 'ほかの属性もまとめて見るなら → <a href="../ADSearch/">ADSearch</a>（RSAT なしで AD のユーザー・グループを検索する PowerShell）'
      : 'Need these attributes for many users at once? → <a href="../../ADSearch/en/">ADSearch</a> (search AD from PowerShell without RSAT)') + '</p>';
    el.out.hidden = false;
    el.out.innerHTML = html;
    $('share').addEventListener('click', function () {
      var url = location.href.split('#')[0] + C.toShareHash(p.source === 'filetime' ? String(p.value) : p.raw, attr);
      history.replaceState(null, '', url);
      copyText(url, T.shareDone);
    });
  }

  // --- 日時 → 数値 ---
  function renderReverse() {
    var v = el.rin.value;
    if (!v) { el.rout.innerHTML = ''; return; }
    var r = C.parseDateTime(v.replace('T', ' '), tz);
    if (!r.ok) { el.rout.innerHTML = '<p class="error">' + esc(T.err[r.error] || T.err.format) + '</p>'; return; }
    var t = r.ticks;
    var html = '<table class="result-table"><tbody>';
    html += row(T.zone + par(tz), zoneText(t, tz), false);
    html += row(T.utc, zoneText(t, 'UTC'), false);
    html += row(T.ftDec, String(t), true);
    html += row(T.ftHex, C.toHex64(t), true);
    html += row(T.unix, String(C.ticksToUnixSeconds(t)), true);
    html += row(T.unixms, String(C.ticksToUnixMs(t)), true);
    html += row(T.dotnet, String(C.ticksToDotnet(t)), true);
    var g = C.ticksToGeneralized(t);
    if (g) html += row(T.gen, g, true);
    html += '</tbody></table>';
    html += '<details class="snippets"><summary>' + esc(T.filterNote) + '</summary><pre>' + esc([
      '(lastLogonTimestamp<=' + t + ')',
      '(pwdLastSet<=' + t + ')',
      '(&(accountExpires<=' + t + ')(!(accountExpires=0)))',
      g ? '(whenCreated>=' + g + ')' : '',
      "Get-ADUser -Filter 'lastLogonTimestamp -lt " + t + "'"
    ].filter(Boolean).join('\n')) + '</pre></details>';
    el.rout.innerHTML = html;
  }

  // --- まとめて変換 ---
  var lastBulk = null;
  var BULK_MAX = 2000;
  function renderBulk() {
    var items = lastBulk;
    if (!items) return;
    if (!items.length) { el.bout.innerHTML = '<p class="error">' + esc(T.bulkNone) + '</p>'; return; }
    var rows = items.map(function (it) {
      var utc, zone, meaning;
      var info = it.source === 'filetime' ? C.interpret(it.value, it.attr) : { kind: 'datetime', notes: [] };
      if (info.kind === 'interval') { utc = '—'; zone = C.formatDuration(it.value); }
      else if (info.kind === 'mininterval' || info.kind === 'negative') { utc = '—'; zone = '—'; }
      else { utc = C.formatUtc(it.ticks); zone = zoneText(it.ticks, tz); }
      var keys = info.notes.filter(function (k) { return ['accountExpiresAduc', 'lastLogonTimestampLag', 'lastLogonPerDc', 'pwdLastSetAge', 'pwdExpiryDate', 'intervalNegative', 'maxPwdAgeHow', 'lockoutDurationHow'].indexOf(k) < 0; });
      meaning = keys.map(function (k) { return T.notes[k].replace(/<[^>]+>/g, '').split(/[。.](\s|$)/)[0]; }).join(' / ');
      if (info.kind === 'interval') meaning = T.duration;
      if (it.guessed) meaning = (meaning ? meaning + ' ' : '') + T.guessed;
      return { line: it.line, attr: it.attr || '—', raw: it.raw, utc: utc, zone: zone, meaning: meaning };
    });
    lastBulkRows = rows;
    var h = T.bulkHead;
    var html = '<p class="small">' + esc(fmt(T.bulkCount, { n: rows.length })) + (rows.length >= BULK_MAX ? ' ' + esc(fmt(T.bulkLimit, { n: BULK_MAX })) : '') +
      ' <button type="button" class="btn btn-sub" id="bulk-copy">' + (LANG === 'ja' ? '表をコピー（TSV）' : 'Copy table (TSV)') + '</button></p>';
    html += '<div class="table-wrap"><table class="bulk-table"><thead><tr><th>' + h.map(esc).join('</th><th>') + '</th></tr></thead><tbody>';
    html += rows.map(function (r) {
      return '<tr><td>' + r.line + '</td><td>' + esc(r.attr) + '</td><td class="num">' + esc(r.raw) + '</td><td>' + esc(r.utc) + '</td><td>' + esc(r.zone) + '</td><td>' + esc(r.meaning) + '</td></tr>';
    }).join('');
    html += '</tbody></table></div>';
    el.bout.innerHTML = html;
    $('bulk-copy').addEventListener('click', function () {
      var tsv = [h.slice(0, 4).concat([h[4] + ' (' + tz + ')', h[5]]).join('\t')].concat(lastBulkRows.map(function (r) {
        return [r.line, r.attr, r.raw, r.utc, r.zone, r.meaning].join('\t');
      })).join('\n');
      copyText(tsv, T.copied);
    });
  }
  var lastBulkRows = [];

  // --- コピー ---
  function copyText(text, okMsg) {
    function done(ok) { el.msg.textContent = ok ? okMsg : T.copyFail; clearTimeout(done.t); done.t = setTimeout(function () { el.msg.textContent = ''; }, 4000); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button.copy');
    if (b) copyText(b.getAttribute('data-copy'), T.copied);
  });

  // --- イベント ---
  el.input.addEventListener('input', renderSingle);
  el.mode.addEventListener('change', renderSingle);
  el.attr.addEventListener('change', renderSingle);
  el.maxAge.addEventListener('input', renderSingle);
  el.rin.addEventListener('input', renderReverse);
  $('now').addEventListener('click', function () {
    var z = C.formatInZone(C.unixMsToTicks(Math.floor(Date.now() / 1000) * 1000), tz);
    el.rin.value = z.text.slice(0, 19).replace(' ', 'T');
    renderReverse();
  });
  $('bulk-run').addEventListener('click', function () {
    lastBulk = C.extractBulk(el.bulk.value, BULK_MAX);
    renderBulk();
  });
  $('bulk-clear').addEventListener('click', function () { el.bulk.value = ''; lastBulk = null; el.bout.innerHTML = ''; });
  Array.prototype.forEach.call(document.querySelectorAll('[data-example]'), function (b) {
    b.addEventListener('click', function () {
      el.input.value = b.getAttribute('data-example');
      el.attr.value = '';
      el.mode.value = 'auto';
      renderSingle();
      el.input.focus();
    });
  });

  // 共有リンク（#v=）で開いたとき
  var shared = C.fromShareHash(location.hash);
  if (shared) {
    el.input.value = shared.value;
    if (shared.attr) {
      var opt = Array.prototype.some.call(el.attr.options, function (o) { return o.value === shared.attr; });
      if (opt) el.attr.value = shared.attr; else el.input.value = shared.attr + ' : ' + shared.value;
    }
    el.msg.textContent = T.loadedShare;
  }
  renderSingle();
  renderReverse();
})();
