# Discord sign-in: setup and operation

Discord OAuth is the primary way players sign in (PR #23). Username/password
remains for the seeded admin accounts and for anyone who still remembers
theirs. This page covers the one-time setup, what to do per environment, and
how linking and recovery work.

## 1. Create the Discord application (once)

1. Go to https://discord.com/developers/applications and click **New Application**. Name it `Project SNARL` (players see this name on the consent screen).
2. Open **OAuth2** in the left menu.
3. Copy the **Client ID**. Click **Reset Secret** and copy the **Client Secret**; it is shown once.
4. Under **Redirects**, add each callback URL exactly (scheme, host, path, no trailing slash):

   | Environment | Redirect URL |
   | --- | --- |
   | Production | `https://snarl-web.vercel.app/api/auth/callback/discord` |
   | Local dev | `http://localhost:3000/api/auth/callback/discord` |
   | A PR preview | `https://snarl-web-git-<branch>-michaellevenick-1933s-projects.vercel.app/api/auth/callback/discord` |

   Discord matches redirect URLs exactly, so a preview deployment only works
   after its branch alias is listed. The alias appears on the deployment page
   in Vercel; the branch name has `/` replaced by `-`. Random
   per-deployment URLs (`snarl-web-abc123.vercel.app`) cannot be used.
5. Click **Save Changes**.

Nothing else on the application needs changing. The app requests only the
`identify` scope: Discord id, username, display name, avatar. No email, no
guilds, no messages.

## 2. Environment variables

| Variable | Where | Value |
| --- | --- | --- |
| `AUTH_DISCORD_ID` | Vercel: Production, Preview, Development. Local `.env`. | Client ID |
| `AUTH_DISCORD_SECRET` | Same, marked **Sensitive** in Vercel. | Client Secret |

`NEXTAUTH_SECRET` (or `AUTH_SECRET`) must already be set; it also signs the
Discord link cookie. After adding the variables, redeploy so the functions
pick them up.

## 3. Database change (once, before the first deploy of PR #23)

Two additive changes to `users`: `password_hash` becomes nullable and
`discord_id` is added as a unique, nullable column.

```sh
vercel env pull .env   # or set POSTGRES_URL by hand
npm run db:push
```

Equivalent SQL if you would rather run it in the Neon console:

```sql
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN discord_id text UNIQUE;
```

Existing rows are untouched. Password login keeps working for every existing
account.

## 4. How players use it

- **New player**: `/login` or `/register` → **Connect with Discord** → consent
  screen → lands in `/chat`. An account is created with their Discord display
  name as username (falls back to their handle, then a suffixed name if taken).
  It has no password; the password form rejects it.
- **Existing player with a password account**: sign in with the password once,
  open the sidebar, click **Link Discord**, approve on Discord. From then on
  Discord sign-in lands in the same account with all their conversations. The
  button disappears once linked.
- **Admins** (`thessarian`, `marcus`, `lyralei`, `kess`, `velani`): same as
  existing players. They can keep using the password, link Discord, or both.
  Linking makes the admin account as safe as that Discord login, so link only
  from your own Discord.

Sessions last 180 days. The server re-checks the user row every 15 minutes,
so a deleted account is signed out within that window and a role change takes
effect without re-login.

## 5. How linking is protected

Clicking **Link Discord** calls `POST /api/auth/link-discord`, which sets a
signed, httpOnly cookie naming the signed-in user, valid for ten minutes. When
Discord redirects back, the JWT callback honours that cookie only if the
session cookie on the same request belongs to the same user. So:

- A stale link cookie on a shared laptop cannot bind the next visitor's
  Discord to someone else's account.
- A Discord account already bound to another user is refused with an error on
  `/login`, never silently switched.
- An account that already has a Discord id is never overwritten.
- The cookie is cleared on use and on sign-out.

Code: `src/lib/auth.ts` (callbacks), `src/lib/discord-account.ts` (resolution
rules, unit-tested with a fake store), `src/lib/link-token.ts` (Web Crypto
HMAC, works on the Edge middleware runtime).

## 6. Recovery and admin tasks

| Situation | What to do |
| --- | --- |
| Player forgot password, never linked Discord | Have them sign in with Discord (new, empty account), then you reset the old account's password in `/admin` so they can sign in with it once and click **Link Discord**. Or skip the old history and let them use the new account. |
| Player's Discord ended up on the wrong account | Clear the link in SQL: `UPDATE users SET discord_id = NULL WHERE username = '...';` then have them link again from the right account. |
| Player lost access to their Discord | Reset their password in `/admin`; they sign in with it and link the new Discord. The old `discord_id` must be cleared first (previous row). |
| Discord login shows "could not confirm who you are" | Usually a redirect URL mismatch (check section 1) or missing env vars on that environment. The Auth.js error is in the Vercel function logs. If it says `unexpected "iss" (issuer)`, the provider needs `issuer: "https://discord.com"` (set in `src/lib/auth.ts`). |

## 7. Rotating the client secret

Reset the secret in the Discord portal, update `AUTH_DISCORD_SECRET` in Vercel
and `.env`, redeploy. Existing sessions are unaffected; only new Discord
sign-ins use the secret.
