# Compliance decisions

Things we deliberately chose **not** to do, and what would change the answer.

This file exists so a later reader can tell a decision from an oversight. If you
find a gap that is listed here, it is known. If you find one that is not, it is
probably real.

Last reviewed: 25 September 2026.

---

## No EU representative (GDPR Art. 27)

**Decision:** not appointing one. Accepted risk.

**The obligation is real.** Article 27 requires a controller outside the EU that
offers services to people in the EU to designate a representative inside it. We
are inside Article 3(2)(a): the app ships 12 languages, the landing page serves
hreflang variants for it/pt/es/fr/de, and Italy and Portugal are the markets we
actively target. Being free does not help — Recital 23 does not require payment
for a service to count as "offered".

**The exemption does not apply.** Article 27(2)(a) exempts processing that is
"occasional". The EDPB defines that in Guidelines 3/2018 (p. 25):

> a processing activity can only be considered as "occasional" if it is not
> carried out regularly, and occurs outside the regular course of business or
> activity of the controller or processor

Collecting accounts and gameplay data is the regular course of this business, so
it is not occasional. The three conditions in Art. 27(2)(a) are cumulative —
failing that one is enough on its own, however harmless an email and a date of
birth are. Guidelines 3/2018 Example 24 (a Turkish site localised for EU
markets) is close to identical to our situation and concludes a representative
is required.

**Why we are skipping it anyway.** About €490/year at the cheap end, against a
low probability of anyone noticing at current scale. The one prominent
enforcement case, Locatefamily.com (€525,000, Dutch DPA), involved publishing
strangers' home addresses without consent — an aggravated case, not a quiet card
game. This is a risk-appetite call, not a reading of the law: the law is not
ambiguous here.

**Revisit when any of these happen:**

- EU installs become a meaningful share of the base — the growth push is aimed
  squarely at Italy and Portugal, so this is the likely trigger.
- Any contact from a supervisory authority, or any data subject request we
  cannot service quickly.
- In-app purchases go live. Taking money from EU consumers raises the stakes and
  pulls in consumer-protection duties that Google currently absorbs as merchant
  of record.
- The app starts collecting anything beyond email, name, date of birth and
  gameplay.

**If we do appoint one:** the representative must be established in a Member
State where our players are (Art. 27(3)) — Italy or Portugal. Their identity
then has to appear in the privacy notice under Art. 13(1)(a). That is a small
edit to `server/lib/legal-content.ts`.

---

## No street address on the legal pages

**Decision:** publish razão social + CNPJ + contact email. No address.

The EU e-Commerce Directive's Art. 5 address requirement binds providers
**established in the EU**. The company is established in Brazil, so it does not
apply. What does apply is GDPR Art. 13, which asks for "the identity and contact
details of the controller" — an email satisfies contact details.

The CNPJ carries the identity: it resolves to the full registered entity in the
Receita Federal's public database, which identifies the operator better than a
street line would.

**Why not the address:** the company's registered sede is a private home
belonging to family. Publishing it would expose people who have nothing to do
with the app.

`COMPANY_ADDRESS` in `server/lib/legal-content.ts` is wired and renders the
moment it is set. Set it if the sede ever moves to a commercial address.

---

## Accessibility is only partly done

The September 2026 compliance pass fixed colour contrast (see `dangerText` /
`successText` in `shared/constants/colors.ts`) but deliberately stopped there.

Still open, and genuinely broken:

- `accessibilityLabel` appears in one file, `components/ErrorFallback.tsx`.
  Every icon-only button — back arrows, card-back swatches, the help and hint
  buttons — is unlabelled to a screen reader.
- The playing cards are images with no text alternative. They are the entire
  game.
- On react-native-web, a `Pressable` without `accessibilityRole="button"` is not
  reliably reachable by keyboard.

Scoped out at the time to ship the legal blockers first. Not a judgement that it
does not matter.

---

## Deliberately not applicable

| Item | Why |
|---|---|
| Cookie banner / cookie policy | The server sets no cookies. No analytics, no third-party scripts on any page. The app stores only the auth token, which is strictly necessary. The equivalent for the app is the AdMob consent form, which is implemented |
| Unsubscribe link | Only transactional email exists (verify, password reset). There is no mailing list to leave |
| Refund policy | Production builds ship no RevenueCat key, so `PURCHASES_AVAILABLE` is false and the purchase UI is hidden. **Write one before shipping that key** |
