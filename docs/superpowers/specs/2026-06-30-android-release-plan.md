# Shipping Brisca — Simple Version

**Goal:** Get the app on Google Play, ads-only (no in-app purchases yet).

Ads already work. Here's the whole path, kept simple.

---

## Do this now (today)

**Create a Google Play Console account** ($25) at play.google.com/console and
**start identity verification.**

Why only this? Verification takes days, and Google makes new accounts run a
**14-day test with ~12 testers** before you can publish. That waiting is your
longest delay — so start the clock today. Everything below can happen while you
wait.

---

## Then, while it verifies (any order)

1. **Put the server online** (Railway) and point the app at it. Without this,
   login and online play don't work for users.
2. **Set up email sending** (verify a domain in Resend). Without this, users
   can't receive their verification code — so they can't use the app at all.
3. **Fill in the Play Store listing**: privacy policy link, a few screenshots,
   description, and mark "contains ads."

## Finally

Build the app → upload to Play → run the 12-tester / 14-day test → publish.

---

## Not now (on purpose)

- In-app purchases / "Remove Ads" (the code is ready; add it in a later update).
- iOS.

> When you're ready to work on any item above, tell me and I'll expand just that
> one into concrete steps — one thing at a time.
