// Public marketing page, robots.txt and sitemap for the web origin.
//
// Inlined as string constants for the same reason as legal-content.ts: the
// Railway runtime image runs the bundled server_dist/index.js without the
// source tree, so `fs.readFileSync` of server/templates/* fails at runtime.
// That is exactly why `/` was serving the bare "API server is running."
// fallback in production — the page this file replaces.
//
// Only languages with real search demand for this game get a translation:
// Portuguese, Spanish and Italian (where Bisca/Brisca/Briscola is actually
// played), plus English, French and German. Everything else falls back to
// English rather than shipping machine-translated marketing copy.

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.jaimetjr.bisca';
const CONTACT_EMAIL = 'jaime.tasca.jr@gmail.com';

const BG = '#1a472a';
const BG_DARK = '#0f2d1a';
const GOLD = '#D4A843';
const GOLD_LIGHT = '#E8C96A';

export const LANDING_LANGUAGES = ['pt', 'es', 'it', 'en', 'fr', 'de'] as const;
export type LandingLanguage = (typeof LANDING_LANGUAGES)[number];
export const DEFAULT_LANDING_LANGUAGE: LandingLanguage = 'en';

interface Copy {
  /** BCP-47 tag for <html lang> and hreflang. */
  htmlLang: string;
  title: string;
  description: string;
  heading: string;
  tagline: string;
  cta: string;
  featuresHeading: string;
  features: string[];
  rulesHeading: string;
  rules: string;
  footerNote: string;
}

const COPY: Record<LandingLanguage, Copy> = {
  pt: {
    htmlLang: 'pt',
    title: 'Bisca — Jogar Bisca Online Grátis',
    description:
      'Joga à Bisca grátis: contra o computador ou online com amigos, 1v1 e 2v2. O clássico jogo de cartas de vazas com baralho de 40 cartas, no Android.',
    heading: 'Bisca',
    tagline: 'O clássico jogo de cartas de vazas — contra a IA ou online, 1v1 e 2v2.',
    cta: 'Descarregar no Google Play',
    featuresHeading: 'O que tem',
    features: [
      'Jogar contra a IA, com três níveis de dificuldade',
      'Multijogador online em tempo real, 1v1 e 2v2, com código de sala',
      'Tutorial integrado que ensina as regras em segundos',
      'Modo offline completo — sem precisar de ligação',
      'Estatísticas, missões diárias e troféus',
      'Disponível em 12 idiomas',
    ],
    rulesHeading: 'Como se joga',
    rules:
      'Cada jogador recebe 3 cartas e o naipe de uma delas fica a trunfo durante todo o jogo. O trunfo mais alto ganha a vaza; sem trunfo, ganha a carta mais alta do naipe que saiu. O Ás vale 11 pontos, o Três vale 10, o Rei 4, o Cavalo 3 e o Valete 2 — são 120 pontos no baralho, e 61 chegam para ganhar.',
    footerNote: 'Grátis, com anúncios.',
  },
  es: {
    htmlLang: 'es',
    title: 'Brisca — Jugar a la Brisca Online Gratis',
    description:
      'Juega a la Brisca gratis: contra la IA o en línea con amigos, 1v1 y 2v2. El clásico juego de cartas de bazas con baraja española de 40 cartas, en Android.',
    heading: 'Brisca',
    tagline: 'El clásico juego de cartas español — contra la IA o en línea, 1v1 y 2v2.',
    cta: 'Descargar en Google Play',
    featuresHeading: 'Qué incluye',
    features: [
      'Juega contra la IA, con tres niveles de dificultad',
      'Multijugador en línea en tiempo real, 1v1 y 2v2, con código de sala',
      'Tutorial integrado que enseña las reglas en segundos',
      'Modo sin conexión completo — no necesitas internet',
      'Estadísticas, misiones diarias y logros',
      'Disponible en 12 idiomas',
    ],
    rulesHeading: 'Cómo se juega',
    rules:
      'Cada jugador recibe 3 cartas y el palo de una carta se convierte en el triunfo de toda la partida. El triunfo más alto gana la baza; sin triunfo, gana la carta más alta del palo de salida. El As vale 11 puntos, el Tres 10, el Rey 4, el Caballo 3 y la Sota 2 — 120 puntos en la baraja, y 61 para ganar.',
    footerNote: 'Gratis, con anuncios.',
  },
  it: {
    htmlLang: 'it',
    title: 'Briscola — Giocare a Briscola Online Gratis',
    description:
      'Gioca a Briscola gratis: contro l’IA o online con gli amici, 1v1 e 2v2. Il classico gioco di carte a mazzo da 40, su Android.',
    heading: 'Briscola',
    tagline: 'Il classico gioco di carte — contro l’IA o online, 1v1 e 2v2.',
    cta: 'Scarica su Google Play',
    featuresHeading: 'Cosa include',
    features: [
      'Gioca contro l’IA, con tre livelli di difficoltà',
      'Multigiocatore online in tempo reale, 1v1 e 2v2, con codice stanza',
      'Tutorial integrato che spiega le regole in pochi secondi',
      'Modalità offline completa — senza connessione',
      'Statistiche, missioni giornaliere e obiettivi',
      'Disponibile in 12 lingue',
    ],
    rulesHeading: 'Come si gioca',
    rules:
      'Ogni giocatore riceve 3 carte e il seme di una carta diventa la briscola per tutta la partita. La briscola più alta prende la mano; senza briscola vince la carta più alta del seme di uscita. L’Asso vale 11 punti, il Tre 10, il Re 4, il Cavallo 3 e il Fante 2 — 120 punti nel mazzo, e 61 bastano per vincere.',
    footerNote: 'Gratis, con pubblicità.',
  },
  en: {
    htmlLang: 'en',
    title: 'Brisca — Play the Spanish Card Game Online Free',
    description:
      'Play Brisca free: against AI or online with friends, 1v1 and 2v2. The classic 40-card Spanish trick-taking card game, on Android.',
    heading: 'Brisca',
    tagline: 'The classic Spanish trick-taking card game — vs AI or online, 1v1 and 2v2.',
    cta: 'Get it on Google Play',
    featuresHeading: 'What you get',
    features: [
      'Play against AI across three difficulty levels',
      'Real-time online multiplayer, 1v1 and 2v2, with room codes',
      'Built-in tutorial that teaches the rules in seconds',
      'Full offline mode — no connection needed',
      'Stats, daily quests and achievements',
      'Available in 12 languages',
    ],
    rulesHeading: 'How to play',
    rules:
      'Each player gets 3 cards and one card’s suit becomes the trump for the whole game. The highest trump wins a trick; with no trump, the highest card of the led suit wins. Aces are worth 11 points, Threes 10, Kings 4, Knights 3 and Jacks 2 — 120 points in the deck, and 61 wins.',
    footerNote: 'Free, ad-supported.',
  },
  fr: {
    htmlLang: 'fr',
    title: 'Brisca — Jouer à la Brisca en ligne gratuitement',
    description:
      'Jouez à la Brisca gratuitement : contre l’IA ou en ligne entre amis, 1v1 et 2v2. Le classique jeu de plis au jeu espagnol de 40 cartes, sur Android.',
    heading: 'Brisca',
    tagline: 'Le classique jeu de cartes espagnol — contre l’IA ou en ligne, 1v1 et 2v2.',
    cta: 'Télécharger sur Google Play',
    featuresHeading: 'Ce que vous obtenez',
    features: [
      'Jouez contre l’IA, avec trois niveaux de difficulté',
      'Multijoueur en ligne en temps réel, 1v1 et 2v2, avec codes de salon',
      'Tutoriel intégré qui enseigne les règles en quelques secondes',
      'Mode hors ligne complet — sans connexion',
      'Statistiques, quêtes quotidiennes et succès',
      'Disponible en 12 langues',
    ],
    rulesHeading: 'Comment jouer',
    rules:
      'Chaque joueur reçoit 3 cartes et la couleur d’une carte devient l’atout pour toute la partie. Le plus fort atout remporte le pli ; sans atout, c’est la plus forte carte de la couleur demandée qui l’emporte. L’As vaut 11 points, le Trois 10, le Roi 4, le Cavalier 3 et le Valet 2 — 120 points dans le jeu, et 61 suffisent.',
    footerNote: 'Gratuit, financé par la publicité.',
  },
  de: {
    htmlLang: 'de',
    title: 'Briscola — Briscola online kostenlos spielen',
    description:
      'Spiele Briscola kostenlos: gegen die KI oder online mit Freunden, 1v1 und 2v2. Der klassische Stichspiel-Klassiker mit 40 Karten, für Android.',
    heading: 'Briscola',
    tagline: 'Der Stichspiel-Klassiker — gegen die KI oder online, 1v1 und 2v2.',
    cta: 'Bei Google Play herunterladen',
    featuresHeading: 'Das bekommst du',
    features: [
      'Spiele gegen die KI in drei Schwierigkeitsgraden',
      'Echtzeit-Mehrspieler online, 1v1 und 2v2, mit Raumcodes',
      'Integriertes Tutorial, das die Regeln in Sekunden erklärt',
      'Vollständiger Offline-Modus — ganz ohne Verbindung',
      'Statistiken, tägliche Aufgaben und Erfolge',
      'In 12 Sprachen verfügbar',
    ],
    rulesHeading: 'Spielablauf',
    rules:
      'Jeder erhält 3 Karten, und die Farbe einer Karte ist für die ganze Partie Trumpf. Der höchste Trumpf gewinnt den Stich; ohne Trumpf gewinnt die höchste Karte der angespielten Farbe. Das Ass zählt 11 Punkte, die Drei 10, der König 4, der Reiter 3 und der Bube 2 — 120 Punkte im Blatt, 61 genügen zum Sieg.',
    footerNote: 'Kostenlos, werbefinanziert.',
  },
};

function isLandingLanguage(value: string): value is LandingLanguage {
  return (LANDING_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Chooses the page language from an explicit `?hl=` override, falling back to
 * the browser's `Accept-Language`, then English. Only the primary subtag is
 * considered — `pt-BR` and `pt-PT` share one marketing page.
 */
export function pickLandingLanguage(
  acceptLanguage?: string,
  override?: string,
): LandingLanguage {
  const explicit = override?.trim().toLowerCase().split('-')[0];
  if (explicit && isLandingLanguage(explicit)) return explicit;

  for (const part of (acceptLanguage ?? '').split(',')) {
    // "pt-BR;q=0.9" → "pt"
    const tag = part.split(';')[0].trim().toLowerCase().split('-')[0];
    if (tag && isLandingLanguage(tag)) return tag;
  }
  return DEFAULT_LANDING_LANGUAGE;
}

/** Minimal HTML escaping for values interpolated into markup and JSON-LD. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function landingHtml(lang: LandingLanguage, baseUrl: string): string {
  const c = COPY[lang];

  const alternates = LANDING_LANGUAGES.map(
    (l) =>
      `  <link rel="alternate" hreflang="${COPY[l].htmlLang}" href="${esc(baseUrl)}/?hl=${l}" />`,
  ).join('\n');

  // Describes the Android app itself, so search engines can associate this page
  // with the Play listing rather than treating it as an unrelated site.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: c.heading,
    description: c.description,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Android',
    inLanguage: c.htmlLang,
    url: PLAY_URL,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  });

  return `<!DOCTYPE html>
<html lang="${c.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(c.title)}</title>
  <meta name="description" content="${esc(c.description)}" />
  <link rel="canonical" href="${esc(baseUrl)}/?hl=${lang}" />
${alternates}
  <link rel="alternate" hreflang="x-default" href="${esc(baseUrl)}/" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(c.title)}" />
  <meta property="og:description" content="${esc(c.description)}" />
  <meta property="og:url" content="${esc(baseUrl)}/" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(c.title)}" />
  <meta name="twitter:description" content="${esc(c.description)}" />
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: ${BG_DARK};
      color: #fff;
      line-height: 1.6;
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
    header { text-align: center; padding-bottom: 2.5rem; }
    h1 {
      font-size: clamp(2.5rem, 8vw, 3.5rem);
      margin: 0 0 .5rem;
      color: ${GOLD};
      letter-spacing: -0.02em;
    }
    .tagline { font-size: 1.15rem; color: rgba(255,255,255,.78); margin: 0 auto 2rem; max-width: 34rem; }
    .cta {
      display: inline-block;
      background: ${GOLD};
      color: #1a1a1a;
      font-weight: 700;
      text-decoration: none;
      padding: .9rem 1.75rem;
      border-radius: 10px;
    }
    .cta:hover { background: ${GOLD_LIGHT}; }
    section { background: ${BG}; border-radius: 14px; padding: 1.5rem 1.5rem .5rem; margin-bottom: 1.25rem; }
    h2 { font-size: 1.15rem; margin: 0 0 .75rem; color: ${GOLD_LIGHT}; }
    ul { margin: 0 0 1rem; padding-left: 1.25rem; }
    li { margin-bottom: .4rem; }
    section p { margin: 0 0 1rem; color: rgba(255,255,255,.85); }
    footer { text-align: center; color: rgba(255,255,255,.55); font-size: .9rem; padding-top: 1.5rem; }
    footer a { color: rgba(255,255,255,.75); }
    .langs { margin-top: .75rem; font-size: .85rem; }
    .langs a { color: rgba(255,255,255,.6); margin: 0 .35rem; text-decoration: none; }
    .langs a:hover { color: ${GOLD_LIGHT}; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${esc(c.heading)}</h1>
      <p class="tagline">${esc(c.tagline)}</p>
      <a class="cta" href="${PLAY_URL}">${esc(c.cta)}</a>
    </header>

    <section>
      <h2>${esc(c.featuresHeading)}</h2>
      <ul>
${c.features.map((f) => `        <li>${esc(f)}</li>`).join('\n')}
      </ul>
    </section>

    <section>
      <h2>${esc(c.rulesHeading)}</h2>
      <p>${esc(c.rules)}</p>
    </section>

    <footer>
      <p>${esc(c.footerNote)} &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
      <p class="langs">
${LANDING_LANGUAGES.map((l) => `        <a href="/?hl=${l}" hreflang="${COPY[l].htmlLang}">${COPY[l].htmlLang.toUpperCase()}</a>`).join('\n')}
      </p>
    </footer>
  </div>
</body>
</html>
`;
}

export const ROBOTS_TXT = (baseUrl: string): string =>
  `User-agent: *
Allow: /
Disallow: /api/
Disallow: /join/

Sitemap: ${baseUrl}/sitemap.xml
`;

export function sitemapXml(baseUrl: string): string {
  const urls = [
    ...LANDING_LANGUAGES.map((l) => `${baseUrl}/?hl=${l}`),
    `${baseUrl}/privacy`,
    `${baseUrl}/terms`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`;
}
