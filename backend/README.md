# SPRING Backend v2 — Postgres, service-oriented

This is the foundation rebuild described in the architecture doc: a proper
relational schema, a server-side fare engine, an enforced trip state
machine, a swappable map provider, and a real transactional wallet ledger.
It replaces the old MongoDB `server.js` — the mobile app in Spring-v5 will
need its API calls updated to point at these new endpoints (see "What's not
connected yet" at the bottom).

## What's real vs what's honestly stubbed

**Fully real, works with no paid service:**
- Auth (signup/login, JWT, phone-based OTP flow, bcrypt passwords)
- Full Postgres schema — trips, fares, wallets, ratings, support, safety,
  driver verification, admin config, audit logs
- Fare engine — every rate pulled from `admin_config`, editable without a
  code deploy, full breakdown stored and never overwritten
- Trip state machine — invalid transitions are rejected with a 400, not
  silently allowed
- Wallet ledger — every balance change is a transactional, row-locked
  credit/debit; balance can never drift from its transaction history
- Map provider — OpenStreetMap/Nominatim + OSRM, no API key needed, real
  geocoding/search/routing
- Driver verification workflow (upload → pending → admin approve/reject)
- Support tickets, safety incident reporting, structured ratings, admin
  dashboard stats, audit log viewer

**Honestly stubbed — clearly marked in the code, not faked:**
- **SMS delivery for OTP** — codes generate and validate for real; without
  an `SMS_PROVIDER` key they're returned directly in the API response, and
  only outside production. Wire up Termii/Africa's Talking in
  `services/authService.js createOtp()` when ready.
- **Card/bank transfer payments** — cash and wallet payments are fully
  functional. Card/transfer return a clear `501 Not configured` error
  until you add `PAYSTACK_SECRET_KEY`. See `routes/payments.js`.
- **Google Maps provider** — the interface exists in
  `services/mapProvider.js`, but only the free OSM implementation is
  written. Swapping in Google later is implementing one file, not a
  rewrite, by design.
- **Push notifications** — `notifications` table exists and gets written
  to; actual delivery (Expo push tokens) isn't wired up yet.

## Setup

```bash
npm install
cp .env.example .env
```

You need a Postgres database. Fastest free options: **Neon** or
**Supabase** both give you a connection string in under a minute with no
card required (unlike Google's billing flow you just went through).
Render also offers a free Postgres tier. Paste whichever connection string
you get into `DATABASE_URL` in `.env`.

Generate your two JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run it twice, paste the two different results into `JWT_SECRET` and
`JWT_REFRESH_SECRET`.

Then run the migration once:
```bash
npm run migrate
```
This creates all 25 tables and seeds the default fare/commission config.
Safe to re-run.

Start the server:
```bash
npm start
```
Or `npm run dev` for auto-restart on file changes.

Health check: `GET /health` should return `{"status":"ok"}`.

## Testing the core flow with curl

```bash
# 1. Request an OTP (devCode comes back since no SMS provider is set)
curl -X POST localhost:3001/api/v1/auth/otp/request -H "Content-Type: application/json" -d '{"phone":"+2348012345678"}'

# 2. Sign up using that code
curl -X POST localhost:3001/api/v1/auth/signup -H "Content-Type: application/json" -d '{"phone":"+2348012345678","password":"test1234","role":"rider","name":"Ada Test","otpCode":"123456"}'

# 3. Get a fare estimate (needs a Bearer token from step 2's response)
curl -X POST localhost:3001/api/v1/trips/fare/estimate -H "Content-Type: application/json" -H "Authorization: Bearer <accessToken>" -d '{"pickup":{"lat":6.5244,"lng":3.3792},"destination":{"lat":6.6018,"lng":3.3515}}'
```

## What's not connected yet (be aware before assuming this is "done")

- **The mobile app (Spring-v5) still points at the old MongoDB server.**
  This new backend is a parallel foundation — connecting the Expo app to it
  means updating `mobile/src/api/api.js` to call these new `/api/v1/...`
  routes with JWT auth instead of the old plain endpoints. That's a real,
  separate chunk of work I haven't done yet — the request/response shapes
  are different (kobo instead of naira floats, JWT instead of a returned
  user object, etc).
- **No admin web dashboard UI** — the admin API endpoints
  (`/api/v1/admin/*`) are real and ready, but there's no web app querying
  them yet. That's the Next.js admin app from the architecture doc,
  not built in this pass.
- **Driver matching is naive** — a ride goes straight to
  `searching_for_driver` with no actual nearest-driver assignment logic
  yet; drivers currently self-select from an "available" list, same as
  Spring-v5's MVP behavior. Smart matching is Phase 4 in the roadmap.
- **No automated tests.** Everything here has been syntax-checked and
  manually reasoned through, but there's no test suite yet — worth adding
  before this handles real money.

## Next steps, in order of what unblocks the most

1. Get a free Postgres instance and run the migration — nothing else can be
   tested until this exists.
2. Connect the mobile app's API layer to these new endpoints (I can do this
   next).
3. Add a Paystack account (free to create, no $10 prepayment like Google's
   billing) and wire up real card payments in `routes/payments.js`.
4. Build the admin dashboard web app against `/api/v1/admin/*`.
