// Legal / compliance pages served by the Express server.
//
// These are inlined as string constants (NOT read from server/templates/*)
// on purpose: the Railway runtime image runs the bundled server_dist/index.js
// without the source tree, so any fs.readFileSync of a source file fails at
// runtime (this is what caused the landing-page ENOENT). Bundling the content
// into the JS guarantees these pages always serve in production.

import { MIN_SIGNUP_AGE } from '../../shared/constants/policy';

const APP_NAME = 'Brisca';
const CONTACT_EMAIL = 'jaime.tasca.jr@gmail.com';
const LAST_UPDATED = 'July 25, 2026';

// AdMob publisher id (from the ca-app-pub-9412542080032324/* ad unit IDs).
// f08c47fec0942fa0 is Google's fixed certification-authority id.
export const APP_ADS_TXT = 'google.com, pub-9412542080032324, DIRECT, f08c47fec0942fa0\n';

function page(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ${APP_NAME}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      margin: 0;
      background: #0f2d1a;
      color: #eaf3ee;
      line-height: 1.6;
    }
    .wrap { max-width: 760px; margin: 0 auto; padding: 40px 24px 80px; }
    header { border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 16px; margin-bottom: 28px; }
    h1 { color: #E4B94C; font-size: 1.9rem; margin: 0 0 6px; }
    h2 { color: #E4B94C; font-size: 1.2rem; margin: 32px 0 8px; }
    .meta { color: #9fb7a8; font-size: 0.9rem; }
    p, li { color: #cfe0d6; }
    a { color: #E4B94C; }
    ul { padding-left: 20px; }
    code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; }
    footer { margin-top: 48px; color: #7f9788; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${APP_NAME}</h1>
      <div class="meta">${title} · Last updated ${LAST_UPDATED}</div>
    </header>
    ${bodyHtml}
    <footer>Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></footer>
  </div>
</body>
</html>`;
}

export const PRIVACY_HTML = page('Privacy Policy', `
  <p>${APP_NAME} ("we", "us") is a Spanish card game (Brisca). This policy explains what
  data we collect, why, and your choices. You can play offline as a guest without an account.</p>

  <h2>Information we collect</h2>
  <ul>
    <li><strong>Account data</strong> (only if you register): email address, first and last
      name, and date of birth (used to confirm you are at least ${MIN_SIGNUP_AGE}).</li>
    <li><strong>Gameplay data</strong> (for registered users): match history, statistics,
      quest progress, and achievements.</li>
    <li><strong>Advertising identifier</strong>: when ads are shown, Google AdMob may access
      your device's advertising ID and related signals to serve and measure ads.</li>
    <li><strong>Technical data</strong>: basic server logs (request method, path, timestamp)
      for reliability and abuse prevention.</li>
  </ul>

  <h2>How we use it</h2>
  <ul>
    <li>To provide accounts, save progress, and enable online multiplayer.</li>
    <li>To verify age eligibility and secure your account.</li>
    <li>To display advertising, which supports the free version of the game.</li>
  </ul>

  <h2>Third-party services</h2>
  <ul>
    <li><strong>Google AdMob</strong> — advertising. See Google's
      <a href="https://policies.google.com/privacy">Privacy Policy</a>.</li>
    <li><strong>Resend</strong> — sends account verification and password-reset emails.</li>
    <li><strong>Railway</strong> — hosts our server and database.</li>
  </ul>

  <h2>Data retention & security</h2>
  <p>Account and gameplay data is kept until you delete your account. Data is transmitted over
  encrypted HTTPS connections. Passwords are stored only as salted hashes, never in plain text.</p>

  <h2>Deleting your data</h2>
  <p>You can permanently delete your account and all associated data at any time from
  <strong>Settings → Delete Account</strong> inside the app. You may also email us at
  <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> to request deletion. See our
  <a href="/account-deletion">account deletion page</a> for details.</p>

  <h2>Children</h2>
  <p>${APP_NAME} is not directed to children under ${MIN_SIGNUP_AGE}. We do not knowingly collect
  data from anyone under ${MIN_SIGNUP_AGE}. If you believe a child under ${MIN_SIGNUP_AGE} has
  provided us data, contact us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> and we
  will delete it.</p>

  <h2>Changes</h2>
  <p>We may update this policy; material changes will be reflected by the "Last updated" date above.</p>
`);

export const TERMS_HTML = page('Terms of Service', `
  <p>By downloading or using ${APP_NAME}, you agree to these terms. If you do not agree,
  please do not use the app.</p>

  <h2>Accounts</h2>
  <p>You must be at least ${MIN_SIGNUP_AGE} years old to create an account. You are responsible for
  keeping your password secure and for activity under your account.</p>

  <h2>Acceptable use</h2>
  <ul>
    <li>Do not cheat, exploit bugs, or disrupt online matches for other players.</li>
    <li>Do not attempt to access other users' accounts or our systems without authorization.</li>
    <li>Do not use the app for any unlawful purpose.</li>
  </ul>

  <h2>Advertising & purchases</h2>
  <p>The free version displays third-party advertising. Any optional purchases (e.g. removing
  ads) are handled by the Google Play billing system and subject to Google's terms.</p>

  <h2>Disclaimer & liability</h2>
  <p>${APP_NAME} is provided "as is", without warranties of any kind. To the extent permitted by
  law, we are not liable for any indirect or incidental damages arising from use of the app.
  Online play depends on third-party infrastructure and may be interrupted.</p>

  <h2>Termination</h2>
  <p>You may stop using the app and delete your account at any time. We may suspend accounts that
  violate these terms.</p>

  <h2>Contact</h2>
  <p>Questions about these terms: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
`);

export const ACCOUNT_DELETION_HTML = page('Account & Data Deletion', `
  <p>You can permanently delete your ${APP_NAME} account and all associated data.</p>

  <h2>In the app (recommended)</h2>
  <ol>
    <li>Open ${APP_NAME}.</li>
    <li>Go to <strong>Settings → Delete Account</strong>.</li>
    <li>Enter your password to confirm.</li>
  </ol>
  <p>This immediately and permanently removes your account, profile, match history, statistics,
  quest progress, and achievements. This action cannot be undone.</p>

  <h2>By email</h2>
  <p>If you cannot access the app, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
  from your account's email address and we will delete your data.</p>

  <h2>What is deleted</h2>
  <ul>
    <li>Email, name, and date of birth.</li>
    <li>Match history, statistics, quests, and achievements.</li>
    <li>All authentication data associated with the account.</li>
  </ul>
`);
