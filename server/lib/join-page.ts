// Invite landing page for shared room links (see
// docs/superpowers/specs/2026-07-17-share-invite-links-design.md).
// Self-contained HTML (no external assets), same pattern as legal-content.ts,
// so it renders correctly from the bundled deploy image.

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.jaimetjr.bisca';

/**
 * Render the invite page for an already-validated room code (uppercase
 * alphanumeric only — the caller must validate before interpolating).
 */
export function joinPageHtml(code: string): string {
  const deepLink = `bisca:///join?code=${code}`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bisca — convite para a sala ${code}</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif;
         background: #1a472a; color: #fff; min-height: 100vh;
         display: flex; align-items: center; justify-content: center; }
  .card { text-align: center; padding: 32px 24px; max-width: 420px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p { color: rgba(255,255,255,.75); font-size: 15px; margin: 8px 0; }
  .code { font-size: 40px; font-weight: 700; letter-spacing: 10px;
          color: #e6b93c; margin: 20px 0 4px; }
  .hint { font-size: 13px; color: rgba(255,255,255,.55); }
  a.btn { display: block; margin: 12px auto 0; padding: 14px 20px; max-width: 280px;
          border-radius: 10px; font-size: 16px; font-weight: 600;
          text-decoration: none; }
  .primary { background: #e6b93c; color: #1a2a1a; }
  .secondary { background: rgba(255,255,255,.12); color: #fff; }
  .en { margin-top: 28px; font-size: 12px; color: rgba(255,255,255,.45); }
</style>
</head>
<body>
  <div class="card">
    <h1>Você foi convidado para uma partida de Bisca!</h1>
    <p>Código da sala:</p>
    <div class="code">${code}</div>
    <p class="hint">Se o link não abrir o app, digite o código na tela "Jogar Online → Entrar".</p>
    <a class="btn primary" href="${deepLink}">Abrir no app</a>
    <a class="btn secondary" href="${PLAY_STORE_URL}">Baixar o app</a>
    <p class="en">Invited to a Bisca match — open the app and enter room code ${code}, or install it from the Play Store.</p>
  </div>
</body>
</html>`;
}
