// ===========================
// FILETIME / LDAP タイムスタンプ変換 — 計算ロジック（画面から切り離した純粋関数）
// DOM や localStorage に触らない。tests/*.test.js から node --test で確かめる
// ブラウザでは window.Calc、Node（テスト）では module.exports で使う
//
// 桁を落とさないため、64 ビットの値はすべて BigInt で扱う（Number は 2^53 までしか正確でない）。
// 日時の組み立てに使う Date は「秒」単位だけで、1 秒未満（100 ナノ秒の 7 桁）は BigInt の余りから出す。
// ===========================
(function (root) {
  'use strict';

  var TICKS_PER_SECOND = 10000000n;          // 100 ns = 1 tick
  var TICKS_PER_MS = 10000n;
  var TICKS_PER_DAY = 864000000000n;
  var EPOCH_1601_TO_1970_SEC = 11644473600n; // 1601-01-01 から 1970-01-01 までの秒数
  var UNIX_EPOCH_TICKS = 116444736000000000n; // 1970-01-01T00:00:00Z の FILETIME
  var DOTNET_OFFSET = 504911232000000000n;    // 0001-01-01 から 1601-01-01 までの tick（.NET DateTime.Ticks との差）
  var MAX_INT64 = 9223372036854775807n;       // 0x7FFFFFFFFFFFFFFF
  var MIN_INT64 = -9223372036854775808n;      // 0x8000000000000000
  var TWO_64 = 18446744073709551616n;
  var YEAR_2200_UNIX = 7258118400;            // 2200-01-01T00:00:00Z

  // --- 属性の分類（Microsoft Learn の Active Directory Schema。出典は guide.html） ---
  var NAMES = {
    filetime: ['pwdLastSet', 'lastLogon', 'lastLogonTimestamp', 'lastLogoff', 'accountExpires', 'badPasswordTime',
      'lockoutTime', 'msDS-UserPasswordExpiryTimeComputed', 'msDS-LastSuccessfulInteractiveLogonTime',
      'msDS-LastFailedInteractiveLogonTime', 'creationTime', 'ms-Mcs-AdmPwdExpirationTime', 'msLAPS-PasswordExpirationTime'],
    interval: ['maxPwdAge', 'minPwdAge', 'lockoutDuration', 'lockOutObservationWindow', 'forceLogoff',
      'msDS-MaximumPasswordAge', 'msDS-MinimumPasswordAge', 'msDS-LockoutDuration', 'msDS-LockoutObservationWindow'],
    gentime: ['whenCreated', 'whenChanged', 'createTimeStamp', 'modifyTimeStamp', 'dSCorePropagationData', 'msTSExpireDate']
  };
  var KIND = {}, CANONICAL = {};
  Object.keys(NAMES).forEach(function (k) {
    NAMES[k].forEach(function (a) { KIND[a.toLowerCase()] = k; CANONICAL[a.toLowerCase()] = a; });
  });

  /** 属性の種類: 'filetime' | 'interval' | 'gentime' | ''（LDAP の属性名は大文字小文字を区別しない） */
  function attrKind(name) { return KIND[String(name || '').toLowerCase()] || ''; }
  /** 知っている属性は正しい大文字小文字に */
  function canonicalAttr(name) { var n = String(name || ''); return CANONICAL[n.toLowerCase()] || n; }

  // --- 数値の読み取り ---

  /**
   * 数値の文字列を BigInt にする。カンマ・空白・アンダースコア・アポストロフィは無視する。
   * 0x で始まれば 16 進（16 桁までの 64 ビット。最上位ビットが立っていれば負の値＝2 の補数）。
   * @returns {bigint|null} 読めなければ null。64 ビット符号付きの範囲外も null
   */
  function parseInteger(str) {
    if (str === null || str === undefined) return null;
    var s = String(str).trim().replace(/[\s,_'’  ]/g, '');
    if (s === '') return null;
    var neg = false;
    if (s[0] === '+' || s[0] === '-' || s[0] === '−') { neg = s[0] !== '+'; s = s.slice(1); }
    var v;
    if (/^0x[0-9a-f]+$/i.test(s)) {
      var hex = s.slice(2).replace(/^0+(?=.)/, '');
      if (hex.length > 16) return null;
      v = BigInt('0x' + hex);
      if (!neg && v > MAX_INT64) v -= TWO_64;       // 0xFFFFFFFFFFFFFFFF → -1
    } else if (/^[0-9]+$/.test(s)) {
      if (s.replace(/^0+/, '').length > 19) return null;
      v = BigInt(s);
    } else {
      return null;
    }
    if (neg) v = -v;
    if (v > MAX_INT64 || v < MIN_INT64) return null;
    return v;
  }

  /** BigInt を 3 桁区切りに */
  function groupDigits(v) {
    var s = String(v < 0n ? -v : v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0n ? '-' : '') + s;
  }

  /** 64 ビットの 2 の補数で 16 進（0x + 16 桁） */
  function toHex64(v) {
    var u = v < 0n ? v + TWO_64 : v;
    return '0x' + u.toString(16).toUpperCase().padStart(16, '0');
  }

  // --- 日時（UTC） ---

  function pad(n, w) { return String(n).padStart(w || 2, '0'); }

  /**
   * FILETIME（0 以上）を UTC の日時の部品に
   * @returns {{y,mo,d,h,mi,s,frac:string,weekday:number,unixSec:number}|null} frac は 1 秒未満の 7 桁
   */
  function ticksToUtcParts(ticks) {
    if (typeof ticks !== 'bigint' || ticks < 0n || ticks > MAX_INT64) return null;
    var sec = ticks / TICKS_PER_SECOND;
    var frac = ticks % TICKS_PER_SECOND;
    var unixSec = Number(sec - EPOCH_1601_TO_1970_SEC);
    var dt = new Date(unixSec * 1000);
    return {
      y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
      h: dt.getUTCHours(), mi: dt.getUTCMinutes(), s: dt.getUTCSeconds(),
      frac: pad(frac, 7), weekday: dt.getUTCDay(), unixSec: unixSec
    };
  }

  function fmtParts(p, withFrac) {
    var s = pad(p.y, 4) + '-' + pad(p.mo) + '-' + pad(p.d) + ' ' + pad(p.h) + ':' + pad(p.mi) + ':' + pad(p.s);
    if (withFrac !== false) s += '.' + p.frac;
    return s;
  }

  /** 'YYYY-MM-DD HH:MM:SS.fffffff'（UTC） */
  function formatUtc(ticks) {
    var p = ticksToUtcParts(ticks);
    return p ? fmtParts(p) : '';
  }

  /** ISO 8601（UTC、7 桁の小数、末尾 Z） */
  function formatIso(ticks) {
    var p = ticksToUtcParts(ticks);
    return p ? fmtParts(p).replace(' ', 'T') + 'Z' : '';
  }

  // --- タイムゾーン（Intl。IANA の名前） ---

  var fmtCache = {};
  function zoneFormatter(tz) {
    if (!fmtCache[tz]) {
      fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
      });
    }
    return fmtCache[tz];
  }

  /** タイムゾーンの名前として使えるか */
  function isValidZone(tz) {
    if (!tz || typeof tz !== 'string' || tz.length > 64) return false;
    try { zoneFormatter(tz); return true; } catch (e) { return false; }
  }

  /** ある瞬間（Unix 秒）の、そのタイムゾーンの壁時計の部品と UTC からのずれ（秒） */
  function zoneWall(unixSec, tz) {
    var o = {};
    zoneFormatter(tz).formatToParts(new Date(unixSec * 1000)).forEach(function (x) { o[x.type] = x.value; });
    var wall = { y: Number(o.year), mo: Number(o.month), d: Number(o.day), h: Number(o.hour) % 24, mi: Number(o.minute), s: Number(o.second) };
    var d = new Date(0);
    d.setUTCFullYear(wall.y, wall.mo - 1, wall.d);
    d.setUTCHours(wall.h, wall.mi, wall.s, 0);
    wall.offsetSec = Math.round(d.getTime() / 1000) - unixSec;
    wall.weekday = d.getUTCDay();
    return wall;
  }

  function fmtOffset(sec) {
    var sign = sec < 0 ? '-' : '+';
    var a = Math.abs(sec);
    var s = sign + pad(Math.floor(a / 3600)) + ':' + pad(Math.floor(a % 3600 / 60));
    if (a % 60) s += ':' + pad(a % 60);
    return s;
  }

  /**
   * FILETIME をタイムゾーンの壁時計に
   * @returns {{text:string, offset:string, weekday:number, offsetSec:number}|null}
   */
  function formatInZone(ticks, tz) {
    var p = ticksToUtcParts(ticks);
    if (!p) return null;
    if (!tz || tz === 'UTC' || tz === 'Etc/UTC') return { text: fmtParts(p), offset: '+00:00', weekday: p.weekday, offsetSec: 0 };
    var w = zoneWall(p.unixSec, tz);
    w.frac = p.frac;
    return { text: fmtParts(w), offset: fmtOffset(w.offsetSec), weekday: w.weekday, offsetSec: w.offsetSec };
  }

  /**
   * 壁時計の日時（あるタイムゾーン）を Unix 秒に。夏時間の切り替えで 2 回ある時刻は早いほう、無い時刻は切り替え後の時刻にずらす
   */
  function wallToUnixSec(y, mo, d, h, mi, s, tz) {
    var dt = new Date(0);
    dt.setUTCFullYear(y, mo - 1, d);
    dt.setUTCHours(h, mi, s, 0);
    var guess = Math.round(dt.getTime() / 1000);
    if (!tz || tz === 'UTC' || tz === 'Etc/UTC') return guess;
    var off1 = zoneWall(guess, tz).offsetSec;
    var t = guess - off1;
    var off2 = zoneWall(t, tz).offsetSec;
    if (off2 !== off1) {
      var t2 = guess - off2;
      if (zoneWall(t2, tz).offsetSec === off2) t = Math.min(t, t2);
    }
    return t;
  }

  /** Unix 秒（整数）と 1 秒未満の tick（0〜9999999）から FILETIME */
  function unixSecToTicks(sec, fracTicks) {
    return (BigInt(sec) + EPOCH_1601_TO_1970_SEC) * TICKS_PER_SECOND + BigInt(fracTicks || 0);
  }

  function validDate(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1) return false;
    var dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    return d <= dim;
  }

  /**
   * 日時の文字列を FILETIME に。
   * 受け付ける形: 2026-09-24 08:30、2026/9/24 8:30:00.1234567、2026-09-24T08:30:00Z、…+09:00、2026年9月24日 8時30分
   * 後ろに Z や ±hh:mm があればそれを使い、無ければ tz（IANA 名）の時刻として読む
   * @returns {{ok:true,ticks:bigint}|{ok:false,error:string}} error はキー（画面で訳す）
   */
  function parseDateTime(str, tz) {
    var s = String(str || '').trim().replace(/　/g, ' ');
    if (!s) return { ok: false, error: 'empty' };
    s = s.replace(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/, '$1-$2-$3')
      .replace(/(\d{1,2})時\s*(\d{1,2})分(?:\s*(\d{1,2})秒)?/, function (_, a, b, c) { return a + ':' + b + (c ? ':' + c : ''); });
    var m = /^(\d{4,5})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,7})\d*)?)?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i.exec(s);
    if (!m) return { ok: false, error: 'format' };
    var y = +m[1], mo = +m[2], d = +m[3], h = +(m[4] || 0), mi = +(m[5] || 0), sec = +(m[6] || 0);
    var frac = m[7] ? Number((m[7] + '000000').slice(0, 7)) : 0;
    if (!validDate(y, mo, d) || h > 23 || mi > 59 || sec > 59) return { ok: false, error: 'range' };
    var unix;
    if (m[8]) {
      var off = 0;
      if (/^[+-]/.test(m[8])) {
        var z = m[8].replace(':', '');
        off = (z[0] === '-' ? -1 : 1) * (Number(z.slice(1, 3)) * 3600 + Number(z.slice(3, 5)) * 60);
      }
      unix = wallToUnixSec(y, mo, d, h, mi, sec, 'UTC') - off;
    } else {
      unix = wallToUnixSec(y, mo, d, h, mi, sec, tz || 'UTC');
    }
    var ticks = unixSecToTicks(unix, frac);
    if (ticks < 0n) return { ok: false, error: 'before1601' };
    if (ticks > MAX_INT64) return { ok: false, error: 'range' };
    return { ok: true, ticks: ticks };
  }

  // --- ほかの形式 ---

  function floorDiv(a, b) { var q = a / b; if (a % b !== 0n && (a < 0n) !== (b < 0n)) q -= 1n; return q; }
  function ticksToUnixSeconds(ticks) { return floorDiv(ticks - UNIX_EPOCH_TICKS, TICKS_PER_SECOND); }
  function ticksToUnixMs(ticks) { return floorDiv(ticks - UNIX_EPOCH_TICKS, TICKS_PER_MS); }
  function unixSecondsToTicks(sec) { return BigInt(sec) * TICKS_PER_SECOND + UNIX_EPOCH_TICKS; }
  function unixMsToTicks(ms) { return BigInt(ms) * TICKS_PER_MS + UNIX_EPOCH_TICKS; }
  function ticksToDotnet(ticks) { return ticks + DOTNET_OFFSET; }
  function dotnetToTicks(dn) { return BigInt(dn) - DOTNET_OFFSET; }

  /** AD の一般化時刻（String(Generalized-Time)）'YYYYMMDDHHMMSS.0Z'。9999 年より後は '' */
  function ticksToGeneralized(ticks) {
    var p = ticksToUtcParts(ticks);
    if (!p || p.y > 9999) return '';
    return pad(p.y, 4) + pad(p.mo) + pad(p.d) + pad(p.h) + pad(p.mi) + pad(p.s) + '.0Z';
  }

  var GENTIME_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:[.,](\d{1,7})\d*)?(Z|[+-]\d{4})?$/;

  /**
   * 一般化時刻を FILETIME に。末尾の ±hhmm は ISO 8601（RFC 4517）のとおり「その地方時の UTC からのずれ」として読む。
   * 末尾が無ければ UTC として読む（AD が返す値は常に Z）
   */
  function parseGeneralized(str) {
    var m = GENTIME_RE.exec(String(str || '').trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = +(m[6] || 0);
    if (!validDate(y, mo, d) || h > 23 || mi > 59 || s > 59) return null;
    var off = 0;
    if (m[8] && m[8] !== 'Z') off = (m[8][0] === '-' ? -1 : 1) * (Number(m[8].slice(1, 3)) * 3600 + Number(m[8].slice(3, 5)) * 60);
    var frac = m[7] ? Number((m[7] + '000000').slice(0, 7)) : 0;
    var ticks = unixSecToTicks(wallToUnixSec(y, mo, d, h, mi, s, 'UTC') - off, frac);
    return ticks < 0n ? null : ticks;
  }
  function isGeneralizedLike(s) {
    s = String(s || '').trim();
    return GENTIME_RE.test(s) && /(\.\d+Z?|Z|[+-]\d{4})$/.test(s.slice(12));
  }

  // --- 期間（負の 100 ns の数） ---

  /**
   * 期間（tick の絶対値）を日・時・分・秒に
   * @returns {{days:bigint,h:number,mi:number,s:number,frac:string,totalDays:number,totalMinutes:number}}
   */
  function durationParts(ticks) {
    var a = ticks < 0n ? -ticks : ticks;
    var days = a / TICKS_PER_DAY;
    var rest = a % TICKS_PER_DAY;
    var secs = Number(rest / TICKS_PER_SECOND);
    return {
      days: days, h: Math.floor(secs / 3600), mi: Math.floor(secs % 3600 / 60), s: secs % 60,
      frac: pad(a % TICKS_PER_SECOND, 7),
      totalDays: Number(a) / 864e9, totalMinutes: Number(a) / 6e8
    };
  }

  /** 期間の短い表記 '42d 00:00:00' */
  function formatDuration(ticks) {
    var p = durationParts(ticks);
    var s = p.days + 'd ' + pad(p.h) + ':' + pad(p.mi) + ':' + pad(p.s);
    if (p.frac !== '0000000') s += '.' + p.frac;
    return (ticks < 0n ? '-' : '') + s;
  }

  // --- 値の解釈 ---

  /**
   * 1 つの数値（BigInt）を、属性名を手がかりに解釈する
   * @returns {{kind:string, ticks:bigint, notes:string[]}}
   *   kind: 'datetime'（日時）| 'never'（最大値＝期限なしの印）| 'zero'（0）| 'interval'（期間）|
   *         'mininterval'（最小値＝無期限の印）| 'negative'（pwdLastSet の -1）
   *   notes: 画面で訳すキー
   */
  function interpret(v, attr) {
    var a = String(attr || '').toLowerCase();
    var kind = attrKind(a);
    var notes = [];
    if (v === MAX_INT64) {
      if (a === 'accountexpires') notes.push('accountExpiresNever');
      else if (a === 'msds-userpasswordexpirytimecomputed') notes.push('pwdExpiryNever');
      else notes.push('maxValue');
      return { kind: 'never', ticks: v, notes: notes };
    }
    if (v === 0n) {
      if (a === 'pwdlastset') notes.push('pwdLastSetZero');
      else if (a === 'accountexpires') notes.push('accountExpiresZero');
      else if (a === 'lockouttime') notes.push('lockoutTimeZero');
      else if (a === 'lastlogon' || a === 'lastlogontimestamp' || a === 'lastlogoff' || a === 'badpasswordtime') notes.push('neverRecorded');
      else if (a === 'msds-userpasswordexpirytimecomputed') notes.push('pwdExpiryZero');
      else if (kind === 'interval') notes.push('intervalZero');
      else notes.push('zeroGeneric');
      return { kind: 'zero', ticks: 0n, notes: notes };
    }
    if (v === MIN_INT64) {
      notes.push(a === 'maxpwdage' || a === 'msds-maximumpasswordage' ? 'maxPwdAgeNever' : 'minValue');
      return { kind: 'mininterval', ticks: v, notes: notes };
    }
    if (v < 0n) {
      if (a === 'pwdlastset' && v === -1n) return { kind: 'negative', ticks: v, notes: ['pwdLastSetMinusOne'] };
      notes.push(kind === 'interval' ? 'intervalNegative' : 'negativeAsInterval');
      if (a === 'maxpwdage' || a === 'msds-maximumpasswordage') notes.push('maxPwdAgeHow');
      if (a === 'lockoutduration' || a === 'msds-lockoutduration') notes.push('lockoutDurationHow');
      return { kind: 'interval', ticks: v, notes: notes };
    }
    if (kind === 'interval') notes.push('intervalPositive');
    if (a === 'accountexpires') notes.push('accountExpiresAduc');
    if (a === 'lastlogontimestamp') notes.push('lastLogonTimestampLag');
    if (a === 'lastlogon') notes.push('lastLogonPerDc');
    if (a === 'pwdlastset') notes.push('pwdLastSetAge');
    if (a === 'msds-userpasswordexpirytimecomputed') notes.push('pwdExpiryDate');
    return { kind: 'datetime', ticks: v, notes: notes };
  }

  /** accountExpires の値から ADUC の「期限: 次の日の終わり（End of）」に出る日付（1 日前）。tz の壁時計で */
  function aducEndOfDate(ticks, tz) {
    if (ticks < TICKS_PER_DAY) return '';
    var z = formatInZone(ticks - TICKS_PER_DAY, tz);
    return z ? z.text.slice(0, 10) : '';
  }

  /** 今（ms）からの差を日数で。正なら過去 */
  function ageDays(ticks, nowMs) {
    return Number(unixMsToTicks(Math.floor(nowMs)) - ticks) / 864e9;
  }

  /** 日数を足す（パスワードの期限＝pwdLastSet + maxPwdAge） */
  function addDays(ticks, days) {
    return ticks + BigInt(Math.round(Number(days) * 86400)) * TICKS_PER_SECOND;
  }

  // --- 1 つの入力の読み取り ---

  /**
   * 1 つの入力（1 行）を読み取る。「属性名 : 値」「属性名=値」「属性名: 値」も受け付ける
   * @param {string} mode 'auto' | 'filetime' | 'unix' | 'unixms' | 'dotnet' | 'gentime' | 'datetime'
   * @param {string} tz 日時の文字列を読むときのタイムゾーン
   * @returns {{ok:boolean, attr:string, raw:string, source?:string, value?:bigint, ticks?:bigint, error?:string}}
   */
  function parseSingle(text, mode, tz) {
    var raw = String(text || '').trim().split(/\r?\n/)[0].trim();
    var attr = '';
    var lm = /^([A-Za-z][\w-]*)\s*[:=]\s*(.+)$/.exec(raw);
    if (lm && !/^0x/i.test(lm[1])) { attr = canonicalAttr(lm[1]); raw = lm[2].trim(); }
    raw = raw.replace(/^["']|["']$/g, '').trim();
    var res = { ok: false, attr: attr, raw: raw };
    if (!raw) { res.error = 'empty'; return res; }
    mode = mode || 'auto';
    var kind = attrKind(attr);

    if (mode === 'gentime' || (mode === 'auto' && (isGeneralizedLike(raw) || kind === 'gentime' && GENTIME_RE.test(raw)))) {
      var g = parseGeneralized(raw);
      if (g !== null) { res.ok = true; res.source = 'gentime'; res.ticks = g; return res; }
      res.error = 'gentime'; return res;
    }
    if (mode === 'datetime' || (mode === 'auto' && /^\d{4}\s*[-/.年]\s*\d{1,2}/.test(raw))) {
      var dt = parseDateTime(raw, tz);
      if (dt.ok) { res.ok = true; res.source = 'datetime'; res.ticks = dt.ticks; return res; }
      res.error = dt.error; return res;
    }
    var v = parseInteger(raw);
    if (v === null) { res.error = /^[-+−]?(0x)?[0-9a-f, _]+$/i.test(raw) ? 'int64' : 'number'; return res; }
    res.value = v;
    var src = mode;
    if (mode === 'auto') {
      var digits = String(v < 0n ? -v : v).length;
      if (kind || v <= 0n || v === MAX_INT64 || /^[-+]?0x/i.test(raw)) src = 'filetime';
      else if (digits <= 11) src = 'unix';           // 11 桁までは Unix 秒（〜 5138 年）
      else if (digits <= 14) src = 'unixms';         // 12〜14 桁は Unix ミリ秒
      else src = 'filetime';
    }
    res.source = src;
    if (src === 'filetime') res.ticks = v;
    else if (src === 'unix') res.ticks = unixSecondsToTicks(v);
    else if (src === 'unixms') res.ticks = unixMsToTicks(v);
    else if (src === 'dotnet') res.ticks = dotnetToTicks(v);
    else { res.error = 'number'; return res; }
    if (src !== 'filetime' && (res.ticks < 0n || res.ticks > MAX_INT64)) { res.error = 'range'; return res; }
    res.ok = true;
    return res;
  }

  /** FILETIME としては 2200 年より後になり、.NET ticks なら 1970〜2200 年に入る数か（別の読み方として案内する） */
  function looksLikeDotnet(v) {
    if (typeof v !== 'bigint' || v <= 0n) return false;
    var limit = unixSecondsToTicks(YEAR_2200_UNIX);
    var ft = v - DOTNET_OFFSET;
    return v >= limit && ft >= UNIX_EPOCH_TICKS && ft < limit;
  }

  // --- まとめて変換（貼り付けた一覧から拾う） ---

  var LINE_RE = /^\s*([A-Za-z][\w-]*)\s*(:|=)\s*(.*?)\s*$/;

  function splitCsvLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  /** 値の文字列が変換の対象か。対象なら { ticks, source, value?, guessed? } */
  function classifyValue(attr, val) {
    var kind = attrKind(attr);
    var s = String(val === undefined || val === null ? '' : val).trim().replace(/^["']|["']$/g, '');
    if (!s) return null;
    if (GENTIME_RE.test(s) && (kind === 'gentime' || isGeneralizedLike(s))) {
      var g = parseGeneralized(s);
      return g === null ? null : { ticks: g, source: 'gentime' };
    }
    if (!/^[-+]?(0x[0-9a-f]+|[0-9][0-9,]*)$/i.test(s)) return null;
    var v = parseInteger(s);
    if (v === null) return null;
    if (kind === 'filetime' || kind === 'interval') return { value: v, ticks: v, source: 'filetime' };
    // 知らない属性は、FILETIME らしい大きさ（1917〜2551 年）の数だけ拾う（logonCount や userAccountControl を拾わない）
    if (v >= 100000000000000000n && v < 300000000000000000n) return { value: v, ticks: v, source: 'filetime', guessed: true };
    return null;
  }

  /**
   * 貼り付けた文字列から、変換できる値をすべて拾う。
   * 対応: Get-ADUser -Properties * の「名前 : 値」、ldifde の「名前: 値」、「名前=値」、csvde の CSV（1 行目が見出し）、
   *       数値だけの行・文の中の 18 桁の数（FILETIME らしい大きさのものだけ）
   * @returns {Array<{line:number, attr:string, raw:string, ticks:bigint, source:string, value?:bigint, guessed?:boolean, dn:string}>}
   */
  function extractBulk(text, maxItems) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var limit = maxItems || 5000;
    var first = -1;
    for (var i = 0; i < lines.length; i++) { if (lines[i].trim()) { first = i; break; } }
    // csvde: 1 行目に見出しがカンマ区切りで並ぶ（知っている属性名が 1 つ以上ある）
    if (first >= 0 && lines[first].indexOf(',') >= 0 && !LINE_RE.test(lines[first])) {
      var head = splitCsvLine(lines[first]).map(function (h) { return h.trim(); });
      if (head.some(function (h) { return attrKind(h); })) {
        var dnCol = head.map(function (h) { return h.toLowerCase(); }).indexOf('dn');
        for (var r = first + 1; r < lines.length && out.length < limit; r++) {
          if (!lines[r].trim()) continue;
          var cells = splitCsvLine(lines[r]);
          for (var c = 0; c < head.length && out.length < limit; c++) {
            if (c === dnCol || !head[c]) continue;
            var cv = classifyValue(head[c], cells[c]);
            if (cv) out.push(Object.assign({ line: r + 1, attr: canonicalAttr(head[c]), raw: String(cells[c]).trim(), dn: dnCol >= 0 ? (cells[dnCol] || '') : '' }, cv));
          }
        }
        return out;
      }
    }
    var dn = '';
    for (var n = 0; n < lines.length && out.length < limit; n++) {
      var line = lines[n];
      if (!line.trim()) continue;
      var m = LINE_RE.exec(line);
      if (m) {
        if (/^(dn|distinguishedname)$/i.test(m[1])) { dn = m[3].replace(/^:\s*/, ''); continue; }
        if (m[2] === ':' && /^:/.test(m[3])) continue;                   // ldifde の base64（名前:: 値）
        var cv2 = classifyValue(m[1], m[3]);
        if (cv2) out.push(Object.assign({ line: n + 1, attr: canonicalAttr(m[1]), raw: m[3], dn: dn }, cv2));
        continue;
      }
      var re = /(^|[^\w.])(-?\d{17,19}|0x[0-9a-f]{15,16})(?![\w.])/gi, mm;
      while ((mm = re.exec(line)) && out.length < limit) {
        var cv3 = classifyValue('', mm[2]);
        if (cv3) out.push(Object.assign({ line: n + 1, attr: '', raw: mm[2], dn: dn }, cv3));
      }
    }
    return out;
  }

  // --- 共有リンク（#v=値、&a=属性名。入力内容は # 以降だけに入れる） ---

  function toShareHash(value, attr) {
    var h = '#v=' + encodeURIComponent(String(value));
    if (attr) h += '&a=' + encodeURIComponent(attr);
    return h;
  }
  function fromShareHash(hash) {
    var s = String(hash || '').replace(/^#/, '');
    if (!s) return null;
    var o = {};
    s.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i <= 0) return;
      try { o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* 壊れた値は無視 */ }
    });
    if (!o.v) return null;
    return { value: String(o.v).slice(0, 80), attr: o.a && /^[A-Za-z][\w-]{0,63}$/.test(o.a) ? o.a : '' };
  }

  // --- 手元で確かめるためのコマンド（文字列として表示するだけ。実行はしない） ---

  function snippets(ticks, kind) {
    if (kind === 'interval' || kind === 'mininterval') {
      if (ticks === MIN_INT64) return [];
      return ['[TimeSpan]::FromTicks(' + (ticks < 0n ? -ticks : ticks) + ')'];
    }
    if (typeof ticks !== 'bigint' || ticks < 0n) return [];
    var list = [
      '[datetime]::FromFileTimeUtc(' + ticks + ')',
      '[datetime]::FromFileTime(' + ticks + ')',
      'w32tm /ntte ' + ticks
    ];
    var p = ticksToUtcParts(ticks);
    if (p && p.y <= 9999 && ticks !== MAX_INT64) {
      list.push('[DateTime]::new(' + p.y + ', ' + p.mo + ', ' + p.d + ', ' + p.h + ', ' + p.mi + ', ' + p.s + ', [DateTimeKind]::Utc).ToFileTimeUtc()');
    }
    return list;
  }

  var api = {
    TICKS_PER_SECOND: TICKS_PER_SECOND, TICKS_PER_DAY: TICKS_PER_DAY, UNIX_EPOCH_TICKS: UNIX_EPOCH_TICKS,
    DOTNET_OFFSET: DOTNET_OFFSET, MAX_INT64: MAX_INT64, MIN_INT64: MIN_INT64,
    attrKind: attrKind, canonicalAttr: canonicalAttr, parseInteger: parseInteger, groupDigits: groupDigits, toHex64: toHex64,
    ticksToUtcParts: ticksToUtcParts, formatUtc: formatUtc, formatIso: formatIso, isValidZone: isValidZone,
    formatInZone: formatInZone, fmtOffset: fmtOffset, wallToUnixSec: wallToUnixSec, unixSecToTicks: unixSecToTicks,
    parseDateTime: parseDateTime, ticksToUnixSeconds: ticksToUnixSeconds, ticksToUnixMs: ticksToUnixMs,
    unixSecondsToTicks: unixSecondsToTicks, unixMsToTicks: unixMsToTicks, ticksToDotnet: ticksToDotnet, dotnetToTicks: dotnetToTicks,
    ticksToGeneralized: ticksToGeneralized, parseGeneralized: parseGeneralized, isGeneralizedLike: isGeneralizedLike,
    durationParts: durationParts, formatDuration: formatDuration,
    interpret: interpret, aducEndOfDate: aducEndOfDate, ageDays: ageDays, addDays: addDays,
    parseSingle: parseSingle, looksLikeDotnet: looksLikeDotnet, extractBulk: extractBulk, splitCsvLine: splitCsvLine,
    classifyValue: classifyValue, toShareHash: toShareHash, fromShareHash: fromShareHash, snippets: snippets
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
