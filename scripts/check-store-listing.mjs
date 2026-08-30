/**
 * Validates every field in `store/listing.md` against the Google Play character
 * limits declared in its own headings (app name 30, short description 80, full
 * description 4000).
 *
 * Play silently truncates or rejects over-length metadata on paste, and the
 * counts are in characters, not bytes — so CJK and Arabic copy has to be
 * measured by code point. Run this before pasting anything into Play Console:
 *
 *   node scripts/check-store-listing.mjs
 *
 * Exits non-zero if any field is over its limit.
 */
import fs from 'node:fs';

const PATH = 'store/listing.md';
/** The three limits Play enforces, keyed to the label we print. */
const LIMITS = { 30: 'title', 80: 'short', 4000: 'full ' };

const lines = fs.readFileSync(PATH, 'utf8').split(/\r?\n/);

/** `# Localization — Italiano [it-IT]  ·  TIER 1` → `Italiano [it-IT]` */
const LOCALE_RE = /^# (?:Primary listing|Localization) — (.+?)\s*(?:·.*)?$/;
/**
 * A field heading carries its own limit in parentheses, in whatever language
 * the block is written in — `(max 30)`, `（30文字以内）`, `(최대 30자)`. Match the
 * number inside either ASCII or full-width parens.
 */
const FIELD_RE = /^##[^(（]*[(（][^)）]*?(\d{2,4})[^)）]*[)）]/;

let locale = '(none)';
let checked = 0;
const failures = [];
const rows = [];

for (let i = 0; i < lines.length; i++) {
  const loc = lines[i].match(LOCALE_RE);
  if (loc) {
    locale = loc[1].trim();
    continue;
  }

  const field = lines[i].match(FIELD_RE);
  if (!field) continue;

  const limit = Number(field[1]);
  if (!(limit in LIMITS)) continue;

  // The value runs until the next heading or horizontal rule.
  const body = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^(##? |---)/.test(lines[j])) break;
    body.push(lines[j]);
  }

  const text = body.join('\n').trim();
  const length = [...text].length;
  const ok = length <= limit;

  checked++;
  if (!ok) failures.push({ locale, limit, length });
  rows.push({ locale, limit, length, ok, preview: text.split('\n')[0].slice(0, 44) });
}

for (const r of rows) {
  // Full descriptions have 4000 characters of headroom; only surface them when
  // they actually break, so the tight fields stay readable.
  if (r.limit === 4000 && r.ok) continue;
  const status = r.ok ? 'ok  ' : 'FAIL';
  const count = `${String(r.length).padStart(4)}/${r.limit}`;
  console.log(`${status}  ${LIMITS[r.limit]}  ${count}  ${r.locale.padEnd(28)} ${r.preview}`);
}

console.log(`\n${checked} fields checked, ${failures.length} over limit`);
if (failures.length) {
  for (const f of failures) {
    console.error(`  ${f.locale}: ${LIMITS[f.limit].trim()} is ${f.length - f.limit} over`);
  }
  process.exit(1);
}
