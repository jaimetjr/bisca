// Invite landing page for shared room links (see
// docs/superpowers/specs/2026-07-17-share-invite-links-design.md).
// Self-contained HTML (no external assets), same pattern as legal-content.ts,
// so it renders correctly from the bundled deploy image.
//
// Translated into the same six languages as the marketing page, and for the
// same reason (see landing-content.ts): this is the last thing a recipient
// sees before deciding to install, and the inviter's language is not the
// invitee's. Everything else falls back to English.

import {
  DEFAULT_LANDING_LANGUAGE,
  LANDING_LANGUAGES,
  pickLandingLanguage,
  type LandingLanguage,
} from './landing-content';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.jaimetjr.bisca';

/** The invite page speaks the same languages as the marketing page. */
export const INVITE_LANGUAGES = LANDING_LANGUAGES;
export type InviteLanguage = LandingLanguage;
export const DEFAULT_INVITE_LANGUAGE = DEFAULT_LANDING_LANGUAGE;
export { pickLandingLanguage as pickInviteLanguage };

interface Copy {
  /** Invite page */
  title: (code: string) => string;
  heading: string;
  codeLabel: string;
  hint: string;
  openApp: string;
  getApp: string;
  /** Room-gone page */
  goneTitle: string;
  goneHeading: string;
  goneBody: string;
}

const COPY: Record<InviteLanguage, Copy> = {
  'pt-BR': {
    title: (code) => `Bisca — convite para a sala ${code}`,
    heading: 'Uma partida de Bisca espera por você!',
    codeLabel: 'Código da sala:',
    hint: 'Se o link não abrir o app, digite o código na tela "Jogar Online → Entrar".',
    openApp: 'Abrir no app',
    getApp: 'Baixar o app',
    goneTitle: 'Bisca — sala não encontrada',
    goneHeading: 'Esta sala não existe mais',
    goneBody:
      'O convite expirou ou a partida já terminou. Peça um novo link ao seu amigo — ou instale o app e crie a sua própria sala.',
  },
  'pt-PT': {
    title: (code) => `Bisca — convite para a sala ${code}`,
    heading: 'Está à tua espera uma partida de Bisca!',
    codeLabel: 'Código da sala:',
    hint: 'Se a ligação não abrir a app, introduz o código no ecrã "Jogar Online → Entrar".',
    openApp: 'Abrir na app',
    getApp: 'Descarregar a app',
    goneTitle: 'Bisca — sala não encontrada',
    goneHeading: 'Esta sala já não existe',
    goneBody:
      'O convite expirou ou a partida já terminou. Pede um novo link ao teu amigo — ou instala a app e cria a tua própria sala.',
  },
  es: {
    title: (code) => `Brisca — invitación a la sala ${code}`,
    heading: '¡Te han invitado a una partida de Brisca!',
    codeLabel: 'Código de la sala:',
    hint: 'Si el enlace no abre la app, escribe el código en la pantalla "Jugar en línea → Unirse".',
    openApp: 'Abrir en la app',
    getApp: 'Descargar la app',
    goneTitle: 'Brisca — sala no encontrada',
    goneHeading: 'Esta sala ya no existe',
    goneBody:
      'La invitación ha caducado o la partida ya ha terminado. Pide un enlace nuevo a tu amigo, o instala la app y crea tu propia sala.',
  },
  it: {
    title: (code) => `Briscola — invito alla stanza ${code}`,
    heading: 'Una partita di Briscola ti aspetta!',
    codeLabel: 'Codice della stanza:',
    hint: 'Se il link non apre l\'app, inserisci il codice nella schermata "Gioca online → Entra".',
    openApp: "Apri nell'app",
    getApp: "Scarica l'app",
    goneTitle: 'Briscola — stanza non trovata',
    goneHeading: 'Questa stanza non esiste più',
    goneBody:
      "L'invito è scaduto o la partita è già finita. Chiedi un nuovo link al tuo amico, oppure installa l'app e crea la tua stanza.",
  },
  en: {
    title: (code) => `Bisca — invite to room ${code}`,
    heading: "You've been invited to a game of Bisca!",
    codeLabel: 'Room code:',
    hint: 'If the link does not open the app, enter the code on the "Play Online → Join" screen.',
    openApp: 'Open in app',
    getApp: 'Get the app',
    goneTitle: 'Bisca — room not found',
    goneHeading: 'This room no longer exists',
    goneBody:
      'The invite expired or the game already finished. Ask your friend for a new link — or install the app and start your own room.',
  },
  fr: {
    title: (code) => `Bisca — invitation au salon ${code}`,
    heading: 'Une partie de Bisca vous attend !',
    codeLabel: 'Code du salon :',
    hint: 'Si le lien n\'ouvre pas l\'application, saisissez le code sur l\'écran « Jouer en ligne → Rejoindre ».',
    openApp: "Ouvrir dans l'app",
    getApp: "Télécharger l'app",
    goneTitle: 'Bisca — salon introuvable',
    goneHeading: "Ce salon n'existe plus",
    goneBody:
      "L'invitation a expiré ou la partie est terminée. Demandez un nouveau lien à votre ami, ou installez l'application et créez votre propre salon.",
  },
  de: {
    title: (code) => `Bisca — Einladung zu Raum ${code}`,
    heading: 'Du wurdest zu einer Partie Bisca eingeladen!',
    codeLabel: 'Raumcode:',
    hint: 'Falls der Link die App nicht öffnet, gib den Code im Bildschirm „Online spielen → Beitreten" ein.',
    openApp: 'In der App öffnen',
    getApp: 'App herunterladen',
    goneTitle: 'Bisca — Raum nicht gefunden',
    goneHeading: 'Diesen Raum gibt es nicht mehr',
    goneBody:
      'Die Einladung ist abgelaufen oder die Partie ist bereits beendet. Bitte deinen Freund um einen neuen Link — oder installiere die App und eröffne deinen eigenen Raum.',
  },
};

const STYLES = `
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
`;

function page(lang: InviteLanguage, title: string, body: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${STYLES}</style>
</head>
<body>
  <div class="card">
${body}
  </div>
</body>
</html>`;
}

/**
 * Render the invite page for an already-validated room code (uppercase
 * alphanumeric only — the caller must validate before interpolating).
 */
export function joinPageHtml(code: string, lang: InviteLanguage = DEFAULT_INVITE_LANGUAGE): string {
  const c = COPY[lang] ?? COPY[DEFAULT_INVITE_LANGUAGE];
  const deepLink = `bisca:///join?code=${code}`;
  return page(
    lang,
    c.title(code),
    `    <h1>${c.heading}</h1>
    <p>${c.codeLabel}</p>
    <div class="code">${code}</div>
    <p class="hint">${c.hint}</p>
    <a class="btn primary" href="${deepLink}">${c.openApp}</a>
    <a class="btn secondary" href="${PLAY_STORE_URL}">${c.getApp}</a>`,
  );
}

/**
 * Render the page for an invite whose room is gone (expired, finished, or a
 * code that never existed). Deliberately has no deep link — there is nothing
 * to open — but keeps the store button, since installing is still the point.
 */
export function roomGoneHtml(lang: InviteLanguage = DEFAULT_INVITE_LANGUAGE): string {
  const c = COPY[lang] ?? COPY[DEFAULT_INVITE_LANGUAGE];
  return page(
    lang,
    c.goneTitle,
    `    <h1>${c.goneHeading}</h1>
    <p>${c.goneBody}</p>
    <a class="btn secondary" href="${PLAY_STORE_URL}">${c.getApp}</a>`,
  );
}
