# SPRING — Combined Project

Everything in one place: the new Postgres backend and the mobile app now
wired to talk to it. Start here.

```
spring-full/
  backend/    Express + Postgres API — the "brain": auth, trips, fares,
              wallets, safety, support, admin
  mobile/     Expo/React Native app — riders and drivers, now calling
              backend/ instead of the old MongoDB server
```

## What changed from the version you had before

- **Database**: MongoDB → PostgreSQL (see the architecture doc for why —
  short version: real transactions matter once money/trip-state is involved)
- **Auth**: email/password → **phone number + OTP + JWT**. Phone is now the
  trust anchor, matching "Nigeria-first" in the brief. No SMS provider is
  wired up yet, so during signup the verification code is shown directly in
  the app (clearly labeled as a dev-mode fallback) instead of being texted.
- **Fare pricing**: was calculated on the phone → now calculated on the
  server, from admin-editable rates, with a full transparent breakdown
  shown to the rider before they confirm.
- **Ride matching**: riders used to pick one specific driver from a list →
  now a rider requests a trip generically, and it becomes visible to every
  online, verified driver to accept — the same "any available driver" model
  as Bolt/Uber, matching the trip state machine in the brief.
- **Maps**: Google Maps (needed your own paid API key + billing account) →
  **your own backend, backed by free OpenStreetMap/OSRM**. This is the big
  win from combining both halves: the mobile app never needs a Google Maps
  key or a billing card again. Address search and route drawing both go
  through `backend/src/services/mapProvider.js`.
- **Money**: naira floats → kobo integers everywhere internally (no
  floating-point rounding surprises on real payments later), converted to
  naira only for display.
- **New**: driver wallet with a real transaction ledger, structured ratings
  (tags, not just stars), support tickets, safety incident reporting + SOS,
  driver suspension/appeal workflow, admin config/dashboard endpoints.

## Setup — do this in order

### 1. Get a free Postgres database
No card required. Pick one: **Neon** (neon.tech) or **Supabase**
(supabase.com) — both give you a connection string in under a minute.

### 2. Set up the backend
```bash
cd backend
npm install
cp .env.example .env
```
Paste your Postgres connection string into `DATABASE_URL` in `.env`.
Generate two JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run it twice, paste the two different results into `JWT_SECRET` and
`JWT_REFRESH_SECRET` in `.env`.

Then:
```bash
npm run migrate    # creates all tables, seeds default fare config
npm start           # runs on http://localhost:3001
```
Confirm it's alive: open `http://localhost:3001/health` — should show
`{"status":"ok"}`.

### 3. Set up the mobile app
```bash
cd mobile
npm install
npx expo install expo-image-picker expo-linear-gradient
```

Open `mobile/src/api/api.js` and set `BASE_URL` to your computer's LAN IP
(same rule as before — not `localhost`, and phone + computer need the same
WiFi):
```js
export const BASE_URL = "http://192.168.1.42:3001";
```

Then:
```bash
npx expo start
```
Scan the QR code with Expo Go.

## Testing the flow

1. Sign up as a rider — enter details, tap Continue, you'll see a 6-digit
   code shown directly in the app (dev mode, no SMS provider set up), enter
   it to finish signup.
2. Sign up as a driver in a second account — same OTP flow, plus car/plate
   and the two photo uploads.
3. **The driver needs manual approval before they can go online.** There's
   no admin app UI yet, so approve them directly with curl:
   ```bash
   curl -X POST http://localhost:3001/api/v1/drivers/<driverId>/verify \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <an admin JWT — see note below>" \
     -d '{"status":"approved"}'
   ```
   **Note:** there's no admin signup flow yet either — the quickest path
   for testing is to manually update one user's `role` to `'admin'` directly
   in your Postgres database (via Neon/Supabase's web SQL editor), log in as
   that user, and use their JWT for admin calls.
4. As the rider, search a pickup and destination, see the fare estimate,
   confirm.
5. As the driver (online, approved), the request appears — accept it, walk
   through arrived → onboard → start → complete.
6. Back on the rider side, watch the status update live, then rate the trip.

## Known gaps — read before assuming something's broken

- **No admin web app.** The `/api/v1/admin/*` endpoints are real; there's
  no UI querying them yet. Test with curl/Postman for now.
- **No SMS delivery.** OTP codes work end-to-end but are shown in-app
  instead of texted, until an SMS provider key is added.
- **Card/transfer payments return "not configured."** Cash and wallet
  payments work fully. Add a Paystack key when ready — see
  `backend/src/routes/payments.js`.
- **Driver matching is simple ("show every searching trip to every online
  driver")**, not smart nearest-driver assignment yet — that's Phase 4 in
  the architecture doc.
- **No push notifications yet** — the `notifications` table gets written to
  but nothing delivers them to a phone yet.

## If something doesn't connect

Almost always one of: `DATABASE_URL` wrong/migration not run, `BASE_URL` in
`api.js` pointing at the wrong address, or phone and computer on different
networks. Check the backend terminal for errors first — it logs every
request that fails.
