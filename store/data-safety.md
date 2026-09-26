# Play Console — Data Safety form answers

Fill in Play Console → App content → Data safety using the answers below.
Based on the actual code: accounts collect email/name/DOB; gameplay stores
match history/stats/quests/achievements; AdMob uses the advertising ID.

## Does your app collect or share any of the required user data types?
**Yes.**

## Is all user data encrypted in transit?
**Yes** — all API and WebSocket traffic is over HTTPS/WSS.

## Do you provide a way for users to request that their data be deleted?
**Yes** — in-app (Settings → Delete Account) and by email. Deletion URL:
`https://biscagame.com/account-deletion`

---

## Data types collected

### Personal info
| Type | Collected | Shared | Processed ephemerally | Optional | Purpose |
|---|---|---|---|---|---|
| Email address | Yes | No | No | No (required to register; guest play needs no account) | Account management |
| Name | Yes | No | No | No | Account management |
| Date of birth | Yes | No | No | No | Account management (age 13+ eligibility) |

### App activity
| Type | Collected | Shared | Purpose |
|---|---|---|---|
| In-app actions / game progress (match history, stats, quests, achievements) | Yes | No | App functionality, personalization |

### Device or other IDs
| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Advertising ID (via Google AdMob) | Yes | Yes (with Google) | Advertising / marketing |

Notes:
- **Account data (email/name/DOB)** is collected only when a user registers.
  Guest mode plays offline and collects none of it.
- **Advertising ID** is collected by the Google Mobile Ads (AdMob) SDK to serve
  and measure ads. In the Data Safety "shared" sense, this goes to Google.
- We do **not** collect location, contacts, photos, messages, audio, files, or
  precise identifiers beyond the above.

## Security practices
- Data encrypted in transit: **Yes**.
- Passwords stored as salted hashes (never plaintext).
- Users can request deletion: **Yes** (in-app + email).

---

## Content rating questionnaire (App content → Content ratings)
- App category: Game.
- Violence / sexual content / profanity / controlled substances: **None**.
- Simulated gambling: **No** — Brisca is a trick-taking card game with no betting,
  no virtual currency wagering, and no real-money gambling.
- User interaction: online multiplayer with other players (no chat/UGC beyond
  gameplay). Declare "Users can interact" = the app has online multiplayer;
  there is no free-text chat.
- Expected result: Everyone / PEGI 3 (or low equivalent per region).

## Ads declaration (App content → Ads)
- Contains ads: **Yes** (Google AdMob — banner, interstitial, rewarded).
