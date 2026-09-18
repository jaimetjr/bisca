# Release notes — 1.3.1 (patch, not yet released) · stability fix

Player-facing wording for the crash-preload fix (see `app/_layout.tsx`): reduces memory use on
startup, which is a plain, honest way to describe it without the internal details (heap class,
`readBundle`, etc.) a player has no use for. Same five configured languages, same rules as below
(paste everything between the two PASTE markers as one block; 500-char limit per language).

`expo.version` has NOT been bumped yet — this block is ready for whenever that release actually
ships. Per this repo's versioning policy this is a PATCH (bug/crash fix, no player-visible
feature), so `expo.version` → `1.3.1` and `MIN_APP_VERSION` stays untouched.

<!-- ===================== PASTE FROM HERE ===================== -->

<pt-BR>
• Reduzimos o uso de memória ao abrir o app, principalmente em celulares mais antigos
• Corrige uma falha rara ao abrir o app em alguns aparelhos

Obrigado por jogar. Continue mandando seu feedback.
</pt-BR>

<en-US>
• Reduced memory use on startup, especially on older phones
• Fixes a rare startup crash reported on some devices

Thanks for playing. Keep the feedback coming.
</en-US>

<es-ES>
• Reducimos el uso de memoria al abrir la app, sobre todo en móviles más antiguos
• Corrige un fallo poco frecuente al abrir la app en algunos dispositivos

Gracias por jugar. Sigue enviando tu opinión.
</es-ES>

<it-IT>
• Riduce l'uso della memoria all'avvio, soprattutto sui telefoni meno recenti
• Risolve un raro crash all'avvio su alcuni dispositivi

Grazie per aver giocato. Continua a mandarci i tuoi feedback.
</it-IT>

<pt-PT>
• Reduzimos o uso de memória ao abrir a app, principalmente em telemóveis mais antigos
• Corrige uma falha rara ao abrir a app em alguns aparelhos

Obrigado por jogares. Continua a enviar o teu feedback.
</pt-PT>

<!-- ====================== PASTE TO HERE ====================== -->

---

# Release notes — 1.3.0 (versionCode 15) · first production release · already shipped, archived below

Already live — nothing here to paste again. Kept for reference on wording/tone/language set only.

This is a debut, not a changelog — nobody reading has seen a previous version, so the notes read
as a launch. Later releases go back to listing what actually changed.

Deck wording: it-IT says "40 carte", not "mazzo spagnolo". Briscola is played with regional
Italian decks, so "Spanish" reads as wrong to Italian players. en, es and both pt keep
"Spanish deck" — there it is correct.

<pt-BR>
Primeira versão na Google Play!

• Jogue Bisca contra uma IA esperta — offline, a qualquer hora
• Online 1v1 e 2v2 com amigos por código de sala
• Baralho espanhol clássico de 40 cartas
• Conquistas, missões diárias e estatísticas
• Grátis para jogar

Obrigado por jogar. Conte pra gente o que dá para melhorar.
</pt-BR>

<en-US>
First release on Google Play!

• Play Brisca against smart AI — offline, anytime
• Online 1v1 and 2v2 with friends via room code
• Classic 40-card Spanish deck
• Achievements, daily quests and career stats
• Free to play

Thanks for playing. Tell us what to improve.
</en-US>

<es-ES>
¡Primera versión en Google Play!

• Juega a la Brisca contra una IA lista — sin conexión, cuando quieras
• Online 1v1 y 2v2 con amigos mediante código de sala
• Baraja española clásica de 40 cartas
• Logros, misiones diarias y estadísticas
• Gratis

Gracias por jugar. Cuéntanos qué podemos mejorar.
</es-ES>

<it-IT>
Prima versione su Google Play!

• Gioca a Briscola contro un'IA in gamba — offline, quando vuoi
• Online 1v1 e 2v2 con gli amici tramite codice stanza
• Mazzo classico da 40 carte
• Obiettivi, missioni giornaliere e statistiche
• Gratis

Grazie per aver giocato. Dicci cosa possiamo migliorare.
</it-IT>

<pt-PT>
Primeira versão na Google Play!

• Joga à Bisca contra uma IA à altura — offline, quando quiseres
• Online 1v1 e 2v2 com amigos através de código de sala
• Baralho clássico de 40 cartas
• Conquistas, missões diárias e estatísticas
• Grátis

Obrigado por jogares. Diz-nos o que podemos melhorar.
</pt-PT>

---

# Parked — languages not configured on this release

Do not paste these as-is. Add the language to the store listing first, then move its block up
into the paste region above.

<es-419>
¡Primera versión en Google Play!

• Juega a la Brisca contra una IA lista — sin conexión, cuando quieras
• Online 1v1 y 2v2 con amigos mediante código de sala
• Baraja española clásica de 40 cartas
• Logros, misiones diarias y estadísticas
• Gratis

Gracias por jugar. Cuéntanos qué podemos mejorar.
</es-419>

<fr-FR>
Première version sur Google Play !

• Jouez à la Brisca contre une IA coriace — hors ligne, quand vous voulez
• En ligne 1v1 et 2v2 avec vos amis via un code de salon
• Jeu espagnol classique de 40 cartes
• Succès, quêtes quotidiennes et statistiques
• Gratuit

Merci d'avoir joué. Dites-nous quoi améliorer.
</fr-FR>

<de-DE>
Erste Version bei Google Play!

• Spiele Briscola gegen eine clevere KI — offline, jederzeit
• Online 1v1 und 2v2 mit Freunden per Raumcode
• Klassisches 40-Karten-Blatt
• Erfolge, Tagesaufgaben und Statistiken
• Kostenlos

Danke fürs Spielen. Sag uns, was wir besser machen können.
</de-DE>

<nl-NL>
Eerste versie op Google Play!

• Speel Briscola tegen een slimme AI — offline, wanneer je wilt
• Online 1v1 en 2v2 met vrienden via een kamercode
• Klassiek kaartspel met 40 kaarten
• Prestaties, dagelijkse quests en statistieken
• Gratis

Bedankt voor het spelen. Laat ons weten wat beter kan.
</nl-NL>

<ru-RU>
Первый релиз в Google Play!

• Играйте в Бриску против умного ИИ — офлайн, в любое время
• Онлайн 1 на 1 и 2 на 2 с друзьями по коду комнаты
• Классическая колода из 40 карт
• Достижения, ежедневные задания и статистика
• Бесплатно

Спасибо за игру. Напишите, что можно улучшить.
</ru-RU>

<ja-JP>
Google Play での初リリースです！

• 賢いAIとブリスカ対戦 — オフラインでいつでも
• ルームコードで友達とオンライン対戦（1対1・2対2）
• 40枚のクラシックなカードデッキ
• 実績、デイリークエスト、戦績
• 無料でプレイ

遊んでいただきありがとうございます。ご意見をお聞かせください。
</ja-JP>

<zh-CN>
首次在 Google Play 发布！

• 与聪明的 AI 对战 Brisca — 随时离线畅玩
• 通过房间码与好友在线对战，支持 1v1 和 2v2
• 经典 40 张牌组
• 成就、每日任务和战绩统计
• 免费游玩

感谢游玩。欢迎告诉我们如何改进。
</zh-CN>

<ko-KR>
Google Play 첫 출시!

• 똑똑한 AI와 브리스카 대결 — 오프라인에서 언제든지
• 방 코드로 친구와 온라인 1대1, 2대2 대결
• 클래식 40장 카드 덱
• 업적, 일일 퀘스트, 전적 통계
• 무료 플레이

플레이해 주셔서 감사합니다. 개선할 점을 알려주세요.
</ko-KR>

<ar>
الإصدار الأول على Google Play!

• العب البريسكا ضد ذكاء اصطناعي ذكي — دون اتصال، في أي وقت
• أونلاين 1ضد1 و2ضد2 مع الأصدقاء عبر رمز الغرفة
• مجموعة كلاسيكية من 40 بطاقة
• الإنجازات والمهام اليومية والإحصائيات
• مجاني

شكرًا للعب. أخبرنا بما يمكن تحسينه.
</ar>
