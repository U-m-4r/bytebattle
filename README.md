# ByteBattle

A competitive 1v1 coding platform where developers race to solve algorithm problems. The first player to submit a passing solution wins. Ratings update after every rated match using a standard chess-style Elo formula.

**Stack:** React + Vite + Tailwind CSS · Node.js + Express · MongoDB + Mongoose · Socket.IO · Monaco Editor

> **Note:** The current deployment uses a mock judge. Submitted code is not executed — see the [Judge section](#judge--code-execution) for details.

---

## Features

- **Email/password authentication** with JWT and bcrypt (salted, 12 rounds)
- **Google Sign-In** via Google OAuth 2.0 — credentials verified server-side using `google-auth-library`
- **Problem library** — difficulty levels, public examples, and hidden test cases (never sent to the client)
- **Monaco Editor** coding workspace (JavaScript)
- **1v1 duels** — create a duel, share an invite link, opponent joins via the link
- **Random problem assignment** — server selects a random problem at duel creation; clients cannot influence the choice
- **Server-authoritative synchronized countdown** — both players see the same 3-2-1-GO sequence driven by a server timestamp, reconnect-safe
- **Server-side submission validation** and winner determination — first accepted submission wins
- **Chess-style Elo ratings** — wins, losses, and rating deltas tracked per match; mock duels are unrated
- **Paginated leaderboard** ordered by Elo with deterministic tie-breaking
- **Public player profiles** — Elo, rank, win rate, and match history
- **Real-time Socket.IO** — countdown events, opponent typing indicator, submission notifications, match completion

---

## Technologies Used

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3, Zustand, Axios, React Router v6 |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| Google Auth (client) | `@react-oauth/google` |
| Backend | Node.js 20, Express 4, Socket.IO 4 |
| Database | MongoDB, Mongoose 8 |
| Auth | JWT (`jsonwebtoken`), bcrypt (`bcryptjs`), Google OAuth (`google-auth-library`) |
| Validation | Zod |
| Testing | Jest 29, Supertest, mongodb-memory-server |

---

## Prerequisites

- Node.js 18 or higher
- MongoDB (local installation or Atlas)
- npm
- A Google Cloud project with an OAuth 2.0 Client ID (for Google Sign-In — optional)

---

## Setup and Installation

### 1. Clone the repository

```bash
git clone https://github.com/U-m-4r/bytebattle.git
cd bytebattle
npm run install:all
```

`install:all` installs dependencies for both `server/` and `client/`.

### 2. Configure server environment variables

Copy the example file:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and fill in your values:

```
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=a_long_random_secret_string_at_least_32_chars
JWT_EXPIRES_IN=7d
JUDGE_PROVIDER=mock
NODE_ENV=development
DUEL_COUNTDOWN_MS=5000

# Google Sign-In (leave blank to disable)
GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

### 3. Configure client environment variables

Create `client/.env` from the example:

```bash
cp client/.env.example client/.env
```

Edit `client/.env`:

```
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

> `GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (client) must be the **same value**. Leave both blank to disable Google Sign-In — email/password auth continues to work.

### 4. Google Sign-In setup (optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** → Web application
3. Under **Authorized JavaScript origins**, add `http://localhost:5173`
4. Copy the **Client ID** into `server/.env` and `client/.env`

### 5. Seed the problem database

Requires MongoDB to be running:

```bash
cd server && npm run seed
```

This upserts 3 starter problems: Two Sum, Valid Parentheses, and Reverse Array.

---

## How to Run the Application

Run these in two separate terminals from the repository root:

```bash
# Terminal 1 — backend (http://localhost:5000)
npm run dev:server

# Terminal 2 — frontend (http://localhost:5173)
npm run dev:client
```

Open `http://localhost:5173` in your browser. Register an account to get started.

To test duels, open a second browser window (or incognito) and register a second account.

---

## Running Tests

```bash
npm run test:server
```

**130 tests across 9 suites:**

| Suite | Tests | Coverage |
|---|---|---|
| `auth.test.js` | 17 | Register, login, JWT, /me endpoint |
| `googleAuth.test.js` | 10 | Google OAuth flow, account creation, repeat login, linking, error cases |
| `duel.test.js` | 29 | Full lifecycle, state machine, invite link, countdown, concurrency guards |
| `randomDuel.test.js` | 5 | Random problem selection, empty pool, problem persistence |
| `submissions.test.js` | 10 | Auth, validation, mock judge, output confidentiality |
| `eloService.test.js` | 11 | Elo math, K-factor, edge cases, minimum rating floor |
| `leaderboard.test.js` | 14 | Rankings, pagination, tie-breaking, no private data leakage |
| `matchHistory.test.js` | 9 | History shape, pagination, unrated match handling |
| `problems.test.js` | 7 | Public endpoints, hidden test case confidentiality |

Tests run against `mongodb-memory-server` — no real database required.

---

## Judge / Code Execution

**Current status: Mock judge (`JUDGE_PROVIDER=mock`)**

Submitted code is **not executed**. The mock judge uses string matching on the submitted source to determine outcomes — there is no `eval`, `vm`, or `child_process` involved.

| Include in your code | Result |
|---|---|
| `FORCE_WRONG` | Wrong Answer on the first test case |
| `FORCE_ERROR` | Runtime Error on the first test case |
| `FORCE_TLE` | Time Limit Exceeded on the first test case |
| *(nothing)* | All test cases pass — Accepted |

Every mock submission includes `"isMock": true` in the API response. Mock duels are **unrated** — they never affect Elo ratings, wins, or losses. The UI shows a disclaimer wherever mock results appear.

**To integrate a real judge:** Set `JUDGE_PROVIDER=judge0`, `JUDGE0_API_URL`, and `JUDGE0_API_KEY` (Judge0 CE via RapidAPI). The provider-agnostic adapter in `server/services/judgeService.js` is ready — the Judge0 HTTP integration is stubbed and awaiting credentials.

---

## Elo Rating System

- Starting rating: 1200
- K-factor: 32 (configurable via `ELO_K_FACTOR` env var)
- Standard Elo expected-score formula
- Minimum rating: 100
- Ratings only update for `isRated: true` duels — mock duels are always unrated
- Duplicate finalization prevented by two sequential atomic `findOneAndUpdate` guards (status transition + `ratingApplied` flag) — no MongoDB transactions required

---

## API Reference

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register with email and password |
| POST | `/api/auth/login` | — | Sign in, receive JWT |
| POST | `/api/auth/google` | — | Google Sign-In or register |
| GET | `/api/auth/me` | ✓ | Current authenticated user |

### Problems

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/problems` | — | List all active problems (no test cases) |
| GET | `/api/problems/:slug` | — | Problem detail (no test cases) |

### Submissions

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/submissions` | ✓ | Submit code (mock judge) |
| GET | `/api/submissions/mine` | ✓ | My submission history |

### Duels

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/duels` | ✓ | Create duel (server assigns random problem) |
| POST | `/api/duels/:id/join` | ✓ | Join a waiting duel |
| GET | `/api/duels/:id` | ✓ | Duel state (participants only) |
| DELETE | `/api/duels/:id` | ✓ | Cancel a waiting duel (creator only) |
| POST | `/api/duels/:id/submit` | ✓ | Submit code to an active duel |

### Leaderboard and Profiles

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/leaderboard` | — | Paginated leaderboard |
| GET | `/api/users/:username` | — | Public player profile |
| GET | `/api/users/:username/history` | — | Match history |

### Socket.IO Events

**Client → Server:** `duel:join`, `duel:leave`, `duel:typing`

**Server → Client:** `duel:countdown` (with `startsAt` timestamp), `duel:opponent_joined`, `duel:submission`, `duel:completed`, `duel:opponent_typing`, `duel:error`

---

## Known Limitations

- **Mock judge only** — code is not evaluated; all submissions "pass" unless a trigger keyword is present
- **JavaScript only** — no other language support
- **3 seeded problems** — the problem library is minimal for demo purposes
- **No matchmaking** — players share invite links manually; there is no automatic pairing queue
- **Google Sign-In requires Google Cloud Console setup** — the button appears but auth fails without a valid Client ID

---

## AI Development Tool Usage — Kiro

This project was built using **[Kiro](https://kiro.dev)**, an agentic AI IDE developed by Anthropic. Kiro served as the primary implementation tool across the full development lifecycle.

### What Kiro is

Kiro is an AI-powered development environment that can autonomously read code, write files, run tests, and iterate on feedback. It operates in a workspace session where the developer defines requirements, reviews output, reports bugs, and makes architectural decisions — while Kiro handles implementation and verification.

### How I used Kiro — 5 concrete examples

**1. Modular server architecture and initial scaffold**

I designed the system architecture: modular monolith, separated routes/controllers/services/models, provider-agnostic judge adapter, and a `createApp()` factory pattern for testability. I specified these constraints explicitly — CommonJS, no TypeScript, Zod for validation, JWT with a `requireAuth` middleware. Kiro scaffolded all 12 server files, installed dependencies with pinned versions, and ran the first 17 Jest tests. I reviewed every file before moving on, checking that the `passwordHash` field was never serialized in responses and that the `createApp()` split correctly prevented port binding in tests.

**2. Duel finalization concurrency safety**

I identified the core risk: two simultaneous accepted submissions racing to finalize the same duel, causing duplicate Elo updates. I specified the requirement — prevent this without MongoDB transactions (since a standalone `mongod` has no replica set). Kiro implemented two sequential atomic `findOneAndUpdate` guards: a status-transition guard (`status: 'active' → 'completed'`) and a `ratingApplied` flag guard. I reviewed the logic, confirmed the design was correct, and requested dedicated concurrency tests. The resulting tests call `finalizeDuel()` twice concurrently with `Promise.all` and assert that only one call returns `ratingChanges` and the user's Elo changes exactly once.

**3. Synchronized duel countdown**

I defined the user experience and the server-authoritative requirement: both players must display the same countdown second at the same wall-clock time; a page refresh during countdown must restore the correct state; the server must block submissions before `startsAt`. I specified that no new `countdown` DB status should be added — use timestamp fields instead to avoid breaking the state machine. Kiro implemented `countdownStartedAt` and `startsAt` fields, the socket `duel:countdown` event, the `CountdownOverlay` React component (server-timestamp-driven at 100ms intervals), and the submission guard. I then reproduced bugs through manual testing — the joiner not seeing the overlay, the creator's display not updating — and reported them precisely enough for Kiro to trace and fix each root cause.

**4. Bug investigation and fixing**

I reproduced several real bugs during manual testing and reported them with exact symptoms:
- "Winner: Unknown" on the winner's own screen — I described the asymmetry (opponent sees winner correctly, winner doesn't). Kiro traced it to the `submitToDuel` HTTP response returning a raw Mongoose document while `GET /api/duels/:id` returned a populated one. The fix was a shared `buildPopulatedDuel()` helper used consistently across all paths.
- The invite-link 403 error — I described the exact flow (Umar2 opens link, immediately sees "not a participant"). Kiro identified that the page called `GET /api/duels/:id` before any join attempt. The fix introduced a public `/invite` endpoint and a join-prompt UI state.
- The 409 dead-end — I reported that the New Duel button silently stopped working. Kiro found that `ProblemsPage` caught the 409 error but only logged it to the console, never redirecting. Fixed by adding the same `existingDuelId` redirect logic that `DuelPage` already had.

**5. Google OAuth and random problem assignment**

I specified both features and their security requirements: Google credentials must be verified server-side with `google-auth-library` (never trust client-supplied email); problem selection must be server-side at duel creation with no client influence. Kiro implemented `googleAuth()` in `authService`, the `/api/auth/google` route, the `GoogleOAuthProvider` wrapper in `main.jsx`, the `googleSignIn` Zustand action, and the random problem selection using `countDocuments + skip`. I reviewed the token verification flow to confirm the `email_verified` check was present and that existing local accounts with matching emails were linked rather than duplicated.

---

## Project Structure

```
bytebattle/
├── server/
│   ├── config/        # Database connection (connectDB with retry)
│   ├── controllers/   # Route handlers — thin, delegate to services
│   ├── middleware/    # requireAuth, validate(zodSchema), globalErrorHandler
│   ├── models/        # Mongoose schemas: User, Problem, Duel, Submission, RatingHistory
│   ├── routes/        # Express routers
│   ├── seeds/         # Problem seed script
│   ├── services/      # Business logic
│   │   ├── authService.js           # register, login, googleAuth, generateToken
│   │   ├── duelService.js           # createDuel, joinDuel, handleDuelSubmission
│   │   ├── duelFinalizationService.js  # finalizeDuel with atomic concurrency guards
│   │   ├── eloService.js            # Pure Elo math — zero DB dependencies
│   │   ├── judgeService.js          # Provider-agnostic adapter (mock + Judge0 stub)
│   │   ├── leaderboardService.js
│   │   └── submissionService.js
│   ├── socket/        # Socket.IO event handlers
│   ├── tests/         # Jest test suites (130 tests)
│   └── validators/    # Zod request schemas
└── client/
    └── src/
        ├── api/       # Axios wrappers for all endpoints
        ├── components/  # Navbar, ProtectedRoute, CountdownOverlay
        ├── pages/     # Route-level page components
        ├── socket/    # Socket.IO client singleton
        └── store/     # Zustand auth store
```
