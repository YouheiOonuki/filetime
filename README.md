# FILETIME・LDAP タイムスタンプ変換

公開 URL: **https://yorozu-craft.com/filetime/** （英語版: https://yorozu-craft.com/filetime/en/）

pwdLastSet・lastLogonTimestamp・accountExpires などの 18 桁の数値を日時に、日時を数値に。貼り付けた一覧もまとめて変換。ブラウザだけで動きます。
yorozu-craft のツールの1つです（共通ルールは [youheioonuki.github.io の README](https://github.com/YouheiOonuki/youheioonuki.github.io) を参照）。企画は yorozu-plans の `docs/GLOBAL.md`（K64）。

## 機能

- **数値 → 日時**: FILETIME（LDAP の Integer8。1601-01-01 UTC からの 100 ns の数）を UTC・端末の時刻・選んだタイムゾーン（IANA 名、Intl）で表示。ISO 8601、16 進、Unix 秒・ミリ秒、.NET DateTime.Ticks、一般化時刻、今からの日数も
- 入力は 10 進（カンマ・空白入り可）、`0x` の 16 進（最上位ビットは負）、「`pwdLastSet : 134…`」「`accountExpires=…`」の行、Unix 秒・ミリ秒、.NET ticks、一般化時刻（`20260924083000.0Z`）、日時の文字列。「自動」は 10〜11 桁を Unix 秒、12〜14 桁を Unix ミリ秒、それ以外を FILETIME として読む
- **特別な値の説明**: accountExpires の `0`・`9223372036854775807`（無期限）、pwdLastSet の `0`（次回ログオン時に変更）と `-1`、lockoutTime の `0`、msDS-UserPasswordExpiryTimeComputed の `0`・最大値、maxPwdAge の最小値（無期限）。負の値（maxPwdAge・lockoutDuration などの期間）は日・時・分で表示
- 属性ごとの注意: lastLogonTimestamp の 9〜14 日の遅れ、lastLogon は DC ごと、accountExpires は ADUC で 1 日前に表示、pwdLastSet からの経過日数と最大有効期間（既定 42 日）での期限
- **日時 → 数値**: LDAP フィルター・Get-ADUser -Filter の例つき
- **まとめて変換**: `Get-ADUser -Properties *`・ldifde・csvde の出力、「名前=値」、18 桁の数の並びから、日時の属性と FILETIME らしい大きさの数だけを拾って表に。TSV でコピー
- PowerShell・w32tm の確認用コマンドを文字として表示（実行はしない）
- 共有リンク `#v=値&a=属性名`（`#` 以降なのでサーバーに送られない）
- 結果の直後に ADSearch への導線を 1 行（サイト README の 21）
- 保存するのはタイムゾーンの選択だけ（`filetime_tz`）。ファイルへの書き出し・読み込み（サイト README の 20）は、保存しているのが表示の設定 1 つだけなので付けていない

文章の量は yorozu-plans の `docs/WRITING.md`（道具）に合わせている。直したら `python3 tools/writing/measure.py --type tool index.html guide.html` と `--en en/index.html en/guide.html` で OK を確かめる。詳しい表・条文・出典の URL は使い方ページの `<details>` の中。

## 計算の仕様・根拠

- 64 ビットの値はすべて BigInt で扱い、桁を落とさない。日時は秒単位を Date で組み立て、1 秒未満の 7 桁は BigInt の余りから出す（`calc.js`）
- タイムゾーンは `Intl.DateTimeFormat` の IANA 名。壁時計 → UTC は 2 回の補正で求め、夏時間で 2 回ある時刻は早いほう、無い時刻は切り替え後にずらす
- 一般化時刻の `±hhmm` は ISO 8601（RFC 4517）どおり地方時の UTC からのずれとして読む（AD の値は常に `Z`）
- 属性の意味の出典は `constants.js`（Microsoft Learn・[MS-ADTS]・[MS-SAMR]。確認日 2026-09-24）。`guide.html` の「根拠と確認日」にも同じものを出している
- テストの既知の値: `0`＝1601-01-01、`116444736000000000`＝1970-01-01、`9223372036854775807`＝30828-09-14 02:48:05.4775807、KB 555936 の `128271382742968750`＝2007-06-24 05:57:54.2968750 UTC、How to Specify Comparison Values の `125911583990000000`＝1999-12-31 23:59:59 UTC、[MS-SAMR] の 20 分＝`-12000000000`

## 保守

| 時期 | 確認すること | 直す場所 |
|------|------------|---------|
| 年に 1 回 | Microsoft Learn の各ページ（属性の説明、既定値）が変わっていないか | `constants.js`、`guide.html`・`en/guide.html` の最終確認日 |
| 新しい日時属性に気づいたとき | 属性の分類に足す | `calc.js` の `NAMES`、テスト |

値や説明を直したら、`guide.html` と `en/guide.html` の「更新履歴」に日付と内容を 1 行足す。

## ファイル

| ファイル | 役割 |
|---------|------|
| `index.html` / `en/index.html` | ツール本体（日本語 / 英語） |
| `guide.html` / `en/guide.html` | 使い方・形式・特別な値・よくある質問（FAQPage）・根拠・注意・更新履歴 |
| `calc.js` | 変換・読み取り・まとめて変換・共有リンク（純粋関数。日英共通） |
| `constants.js` | 出典（Microsoft の文書と確認日） |
| `main.js` | 画面の制御。日英の文言（`STR`）を `<html lang>` で切り替える |
| `style.css` | 見た目（和紙風の配色、ダークモード対応） |
| `404.html` | ツール配下の存在しない URL で出るページ（サイト共通のもの） |
| `favicon.svg` / `apple-touch-icon.png` / `og-image.png` | アイコン / ホーム画面用アイコン / SNS 共有用画像（1200×630） |
| `sitemap.xml` | サイトマップ（日英 4 ページ、hreflang つき） |
| `tests/*.test.js` | テスト（`node --test tests/*.test.js`。`.github/workflows/test.yml` で push・PR のたびに自動実行） |

## ライセンス

MIT License（`LICENSE`）。
