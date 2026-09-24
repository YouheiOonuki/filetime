// ===========================
// このツールが拠っている外部の資料（値・出典・確認日をセットで）
// 変換の式そのもの（1601 年起点・100 ns 単位）は変わらないが、属性の意味や既定値は Microsoft の文書に拠るので、
// どの文書のどこを見たかをここにまとめ、guide.html の「根拠」と README に同じものを出す
// ブラウザでは window.Constants、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-09-24';
  var CONSTANTS = {
    filetimeEpoch: {
      value: '100 ns intervals since 1601-01-01 00:00 UTC',
      label: 'FILETIME の定義（1601 年 1 月 1 日 UTC からの 100 ナノ秒の数）',
      source: 'Microsoft Learn: File Times',
      url: 'https://learn.microsoft.com/windows/win32/sysinfo/file-times',
      checked: CHECKED
    },
    pwdLastSetZero: {
      value: 0,
      label: 'pwdLastSet = 0 は次回ログオン時に変更が必要（UF_DONT_EXPIRE_PASSWD が無いとき）',
      source: 'Microsoft Learn: Pwd-Last-Set attribute',
      url: 'https://learn.microsoft.com/windows/win32/adschema/a-pwdlastset',
      checked: CHECKED
    },
    pwdLastSetMinusOne: {
      value: -1,
      label: 'pwdLastSet に -1 を書くと「次回ログオン時の変更は不要」',
      source: 'Microsoft Learn: User Security Attributes (pwdLastSet)',
      url: 'https://learn.microsoft.com/windows/win32/ad/security-properties',
      checked: CHECKED
    },
    accountExpiresNever: {
      value: ['0', '9223372036854775807'],
      label: 'accountExpires = 0 または 0x7FFFFFFFFFFFFFFF は無期限（作成時の既定は後者、期限を外すと 0）',
      source: 'Microsoft Learn: Account-Expires attribute',
      url: 'https://learn.microsoft.com/windows/win32/adschema/a-accountexpires',
      checked: CHECKED
    },
    accountExpiresAduc: {
      value: -1,
      label: 'ADUC は accountExpires の 1 日前を「期限: 次の日の終わり」として表示する',
      source: 'Microsoft Learn: Account Expiration (LDAP Provider)',
      url: 'https://learn.microsoft.com/windows/win32/adsi/account-expiration',
      checked: CHECKED
    },
    lastLogonTimestampSync: {
      value: 14,
      label: 'lastLogonTimestamp は「今 − msDS-LogonTimeSyncInterval（既定 14 日）」より古いときだけ更新。9〜14 日遅れることがある',
      source: 'Microsoft Learn: Last-Logon-Timestamp attribute / The lastLogonTimestamp attribute may not be accurate (KB 2679653)',
      url: 'https://learn.microsoft.com/windows/win32/adschema/a-lastlogontimestamp',
      url2: 'https://learn.microsoft.com/troubleshoot/mem/configmgr/discovery/lastlogontimestamp-not-accurate',
      checked: CHECKED
    },
    lastLogonZero: {
      value: 0,
      label: 'lastLogon = 0 は最終ログオンが不明。lastLogon は複製されない（System-Flags 0x11）',
      source: 'Microsoft Learn: Last-Logon attribute',
      url: 'https://learn.microsoft.com/windows/win32/adschema/a-lastlogon',
      checked: CHECKED
    },
    lockoutTimeZero: {
      value: 0,
      label: 'lockoutTime = 0 はロックアウトされていない',
      source: 'Microsoft Learn: Lockout-Time attribute',
      url: 'https://learn.microsoft.com/windows/win32/adschema/a-lockouttime',
      checked: CHECKED
    },
    lockoutDurationNegative: {
      value: 'negative',
      label: 'lockoutDuration は 100 ns の数の負の値で持つ',
      source: 'Microsoft Learn: Lockout-Duration attribute',
      url: 'https://learn.microsoft.com/windows/win32/adschema/a-lockoutduration',
      checked: CHECKED
    },
    deltaTime: {
      value: 'negative FILETIME',
      label: 'maxPwdAge などの delta time は負の FILETIME（20 分 = -12000000000）',
      source: '[MS-SAMR] 1.1 Glossary: delta time / 3.1.1.5 Password Settings Attributes',
      url: 'https://learn.microsoft.com/openspecs/windows_protocols/ms-samr/7b2aeb27-92fc-41f6-8437-deb65d950921',
      checked: CHECKED
    },
    pwdExpiryComputed: {
      value: ['0', '0x7FFFFFFFFFFFFFFF'],
      label: 'msDS-UserPasswordExpiryTimeComputed の決まり（無期限の条件は 0x7FFFFFFFFFFFFFFF、pwdLastSet = 0 なら 0、maxPwdAge = 0x8000000000000000 は無期限）',
      source: '[MS-ADTS] 3.1.1.4.5.33 msDS-UserPasswordExpiryTimeComputed',
      url: 'https://learn.microsoft.com/openspecs/windows_protocols/ms-adts/f9e9b7e2-c7ac-4db6-ba38-71d9696981e9',
      checked: CHECKED
    },
    maxPwdAgeDefault: {
      value: 42,
      label: 'パスワードの最大有効期間の既定は 42 日（0 は無期限）',
      source: 'Microsoft Learn: Policy CSP - DeviceLock / MaximumPasswordAge',
      url: 'https://learn.microsoft.com/windows/client-management/mdm/policy-csp-devicelock#maximumpasswordage',
      checked: CHECKED
    },
    generalizedTime: {
      value: 'YYYYMMDDHHMMSS.0Z',
      label: 'whenCreated などの String(Generalized-Time) の形',
      source: 'Microsoft Learn: String(Generalized-Time) syntax',
      url: 'https://learn.microsoft.com/windows/win32/adschema/s-string-generalized-time',
      checked: CHECKED
    },
    w32tmNtte: {
      value: 'w32tm /ntte',
      label: 'w32tm /ntte は NT 時刻（1601 年からの 10^-7 秒）を読める形にする。例 128271382742968750 = 2007-06-24 05:57:54 UTC',
      source: 'Microsoft Learn: How to convert date/time attributes in Active Directory to standard time format (KB 555936)',
      url: 'https://learn.microsoft.com/troubleshoot/windows-server/active-directory/convert-datetime-attributes-to-standard-format',
      checked: CHECKED
    },
    dotnetTicks: {
      value: '504911232000000000',
      label: '.NET の DateTime.Ticks は 0001-01-01 からの 100 ns の数（FILETIME との差 504911232000000000）',
      source: 'Microsoft Learn: DateTime.Ticks Property / DateTime.FromFileTimeUtc',
      url: 'https://learn.microsoft.com/dotnet/api/system.datetime.ticks',
      checked: CHECKED
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONSTANTS;
  else root.Constants = CONSTANTS;
})(this);
