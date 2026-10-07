# Banking Ledger System Backend — Technical Interview Preparation Guide

**Date:** October 7, 2026  
**Repository analyzed:** `sharma-2712/Banking-Ledger-System-Backend`  
**Scope note:** This guide is based strictly on current backend code. It does **not** assume missing components.

---

## 1) Project Overview

### What problem this project solves
This backend models money movement with an immutable ledger so balances are derived from credits/debits instead of mutable “balance” fields, reducing accidental inconsistency.

### Why it was needed
- To support authenticated user accounts and account-level transfers.
- To enforce idempotency for transfer retries.
- To keep an auditable transaction trail.

### Target users
- End users with accounts who transfer funds.
- A privileged system user for initial-funds provisioning.
- Backend integrators calling REST APIs (no frontend in repo).

### End-to-end workflow (input → output)
1. Client registers/logs in (`/api/auth/*`) and receives JWT + cookie.
2. Auth middleware verifies JWT and blacklist status.
3. User creates/retrieves accounts (`/api/accounts/*`).
4. User calls transfer API with `fromAccount`, `toAccount`, `amount`, `idempotencyKey`.
5. Backend validates request, checks account status, computes sender balance from ledger.
6. Backend writes transaction + debit/credit ledger entries in MongoDB session.
7. Transaction status is updated to `COMPLETED`; success response returns transaction.
8. Email notification is sent after transfer.

---

## 2) Architecture

### Implemented architecture
- **Backend:** Node.js + Express (single service).
- **Database:** MongoDB via Mongoose.
- **Auth:** JWT via cookie or bearer token + blacklist collection.
- **Email external service:** Gmail OAuth2 via Nodemailer.

### Explicit non-implemented layers
- **Frontend:** Not implemented in current code.
- **AI/ML:** Not implemented in current code.
- **Payment gateway integration:** Not implemented in current code.
- **Deployment/IaC pipelines in repo:** Not implemented in current code.

### Data flow summary
Client → Express route → middleware auth/authorization → controller business logic → Mongoose models and MongoDB transaction/aggregation → response + optional email.

### Text architecture diagram
```text
[Client/API Consumer]
        |
        v
[Express App: src/app.js]
   |          |            |
   v          v            v
[Auth]    [Accounts]   [Transactions]
 Routes      Routes        Routes
   |           |             |
   v           v             v
[auth.middleware.js] --> [Controllers]
                              |
                              v
                      [Mongoose Models]
            user / account / transaction / ledger / tokenBlackList
                              |
                              v
                           [MongoDB]
                              |
                              v
                  [Nodemailer Gmail OAuth2]
```

---

## 3) Codebase / File Explanation

| File | Role | Key details |
|---|---|---|
| `server.js` | Bootstrap | Loads env, connects DB, starts app on port 3000. |
| `src/app.js` | Express assembly | JSON/urlencoded/cookie parser middleware + route mounting. |
| `src/config/db.js` | DB connection | Connects using `process.env.MONGODB_URI`; exits on failure. |
| `src/routes/auth.route.js` | Auth routes | Register, login, logout endpoints. |
| `src/routes/account.route.js` | Account routes | Protected create/list/balance endpoints. |
| `src/routes/transaction.route.js` | Transfer routes | Protected standard transfer + system-only initial-funds endpoint. |
| `src/middleware/auth.middleware.js` | Security gate | Verifies token + blacklist + user fetch; separate system-user middleware. |
| `src/controller/auth.controller.js` | Auth logic | Register/login JWT issuance (`7d`), logout blacklist insert + clear cookie. |
| `src/controller/account.controller.js` | Account logic | Create account, list user accounts, fetch balance by account ownership. |
| `src/controller/transaction.controller.js` | Transfer logic | Idempotency, status checks, balance derivation, ledger writes, email. |
| `src/models/user.model.js` | User schema | Email unique, bcrypt password hash, `systemUser` immutable hidden field. |
| `src/models/account.model.js` | Account schema | User reference + status/currency + `getBalance()` aggregation helper. |
| `src/models/transaction.model.js` | Transaction schema | `fromAccount`, `toAccount`, `amount`, `status`, unique `idempotencyKey`. |
| `src/models/ledger.model.js` | Immutable ledger | CREDIT/DEBIT entries with update/delete hooks blocked. |
| `src/models/blackListModel.js` | Token revocation | Stores invalidated JWTs; TTL index of 3 days on `createdAt`. |
| `src/services/email.service.js` | Email integration | Sends registration and transfer emails via Gmail OAuth2 transporter. |

---

## 4) Complete API Endpoint Table

| Method | URL | Auth | Request Body | Success Response | What it actually does |
|---|---|---|---|---|---|
| GET | `/` | No | None | text message | Health/status text: ledger service running. |
| POST | `/api/auth/register` | No | `name,email,password` | `201` with user + JWT, sets cookie | Creates user, hashes password (pre-save hook), issues `7d` token, sends registration email. |
| POST | `/api/auth/login` | No | `email,password` | `200` with user + JWT, sets cookie | Validates credentials, issues JWT. |
| POST | `/api/auth/logout` | Optional token | None | `200` message | If token exists: saves token in blacklist, clears cookie. |
| POST | `/api/accounts/` | Yes (`authMiddleware`) | none | `201` account object | Creates account for authenticated user with defaults (`ACTIVE`, `INR`). |
| GET | `/api/accounts/` | Yes | none | `200` account list | Returns all accounts where `user=req.user._id`. |
| GET | `/api/accounts/balance/:accountId` | Yes | URL param `accountId` | `200` with `accountId,balance` | Validates account belongs to user; computes balance via ledger aggregate. |
| POST | `/api/transactions/` | Yes | `fromAccount,toAccount,amount,idempotencyKey` | `201` with transaction or status responses | Transfer flow with idempotency checks, ledger writes, transaction completion, success email. |
| POST | `/api/transactions/system/initial-funds` | Yes (`authSystemUserMiddleware`) | `toAccount,amount,idempotencyKey` | `201` with transaction | System-user-only transfer from system user's account to target account. |

---

## 5) Database Schema and Relationships

### Collections
1. `users`
2. `accounts`
3. `transactions`
4. `ledgers`
5. `tokenblacklists` (model name tokenBlackList)

### Schema details
- **User**: `email(unique)`, `name`, `password(select:false, bcrypt)`, `systemUser(select:false, immutable)`, timestamps.
- **Account**: `user(ref users, indexed)`, `status(enum ACTIVE/FROZEN/CLOSED)`, `currency(default INR)`, timestamps.
- **Transaction**: `fromAccount(ref accounts, indexed)`, `toAccount(ref accounts, indexed)`, `amount(min 0)`, `status`, `idempotencyKey(unique,indexed)`, timestamps.
- **Ledger**: `account(ref accounts,indexed,immutable)`, `transaction(ref transactions,indexed,immutable)`, `amount`, `type(CREDIT/DEBIT)`, immutable hooks preventing update/delete.
- **Token blacklist**: `token(unique)`, timestamps + TTL index on `createdAt` of 3 days.

### Relationships
- One User → many Accounts.
- One Transaction → two Accounts (from/to).
- One Transaction → two Ledger rows expected (debit/credit).
- One Account → many Ledger rows.
- Blacklist entry is independent but checked in auth middleware.

### Query/index notes
- Good: indexes on account ownership, transaction account refs, idempotency key.
- Good: TTL index for blacklist cleanup.
- Missing: compound indexes for high-volume transaction listing (not implemented because no listing endpoint).

---

## 6) Security Analysis

### Implemented controls
- Password hashing via bcrypt pre-save hook.
- JWT authentication with signed token (`JWT_SECRET_KEY`).
- Token revocation using blacklist collection.
- Protected routes and system-user-only middleware.
- Immutable ledger constraints via schema immutability + pre-hooks.
- Basic input presence checks in controllers.

### Security gaps in current code (explicit)
1. **Missing sender-account ownership validation in transfer**: `createTransaction` verifies account existence but does not enforce `fromAccount.user === req.user._id`. This is a serious authorization bug.
2. **JWT lifetime mismatch**: JWT valid for 7 days, blacklist TTL only 3 days. A logged-out token can become usable again after blacklist doc expires but token remains unexpired.
3. **No CORS policy configured**.
4. **No security headers middleware (e.g., helmet)**.
5. **No API rate limiting**.
6. **No CSRF protection while using cookies**.
7. **No validation library/sanitization layer (Joi/Zod/express-validator)**.
8. **Verbose transport/email logs may expose metadata in logs.**
9. **`multer` dependency exists but is unused, increasing attack surface without value.**

### Interview-safe statement
“The project demonstrates core auth and ledger concepts but is not production-grade security yet; I can explicitly identify and prioritize the gaps above.”

---

## 7) Technologies and Tradeoffs (What to say in interview)

| Technology | Why used here | Pros | Tradeoffs / Alternatives |
|---|---|---|---|
| Node.js + Express | Fast REST API development | Large ecosystem, quick iteration | Single-thread event loop; alternatives: NestJS/Fastify/Go |
| MongoDB + Mongoose | Flexible docs + rapid modeling | Fast dev, schema + hooks support | Multi-document transaction overhead; alternative: PostgreSQL for stronger relational constraints |
| JWT | Stateless auth token | Scales horizontally, simple | Revocation complexity; alternative: server sessions/opaque tokens |
| Bcrypt | Password hashing | Industry standard | CPU cost at scale; alternative: Argon2 |
| Nodemailer (OAuth2 Gmail) | Email notifications | Easy setup | External dependency latency/failure, Gmail limits; alternative SES/SendGrid |
| Idempotency key | Duplicate prevention | Safe retries | Requires proper lifecycle/error handling |
| MongoDB transactions | Atomic multi-write transfer | Consistency across transaction+ledger docs | Latency, contention, session complexity |

---

## 8) AI/ML and Frontend Status (explicit)

- **AI/ML functionality:** **Not implemented in the current code.**
- **Frontend application:** **Not implemented in the current code.**

Any resume/interview claim should avoid frontend or AI/ML ownership for this repository.

---

## 9) Performance and Scalability Analysis

### Current bottlenecks
1. **Intentional 15-second delay inside MongoDB transaction** in transfer flow (`setTimeout(15s)`), massively reducing throughput and increasing lock/session duration.
2. Balance derived via ledger aggregation per transfer; no cached/materialized balance.
3. Email sending in request lifecycle adds latency after transaction.
4. Single service instance; no worker/queue split.

### Scale behavior estimates
- **1,000 users:** Works for light traffic but transfer latency remains high because of 15-second delay.
- **10,000 users:** Contention and queueing likely; transaction sessions held too long.
- **100,000 users:** Current design likely bottlenecks heavily without queueing, caching, partitioning, and horizontal scale.

### Improvement roadmap
- Remove delay from transaction path.
- Move email to async queue (BullMQ/RabbitMQ/SQS worker).
- Add sender ownership and stronger validation to reduce invalid load.
- Add read-model balance cache updated atomically with ledger entries.
- Add pagination/listing endpoints with proper indexes.
- Add rate limiting and API gateway-level protections.
- Introduce observability (metrics/traces) and autoscaling strategy.

---

## 10) Failure Cases: Current vs Recommended Behavior

| Failure case | Current behavior | Recommended behavior |
|---|---|---|
| Missing required transfer fields | Returns 400 with required message | Keep 400 + structured validation error details per field |
| Invalid account IDs / nonexistent accounts | Returns 400 invalid account message | Differentiate malformed ObjectId vs not found (400 vs 404) |
| Insufficient funds | Returns 400 with current balance | Keep, but avoid exposing full internals in prod logs |
| Duplicate idempotency key (COMPLETED) | Returns 200 already processed | Keep; include deterministic payload and same status code |
| Duplicate idempotency key (FAILED/REVERSED) | Returns 500 | Return 409/422 with retry semantics and reason codes |
| Sender account not owned by caller | **Currently allowed if account exists** | Must return 403 and reject transaction |
| Account status not ACTIVE | Returns 400 | Keep with standardized error code |
| DB error during transfer | Returns 400 pending message; no explicit abort/final cleanup | Explicit `abortTransaction()` in catch + `finally` end session |
| App crash between debit/credit | Transaction should rollback if abort path is correct; currently cleanup incomplete | Use try/catch/finally with guaranteed abort/end, alerting |
| Email send failure after commit | Core transfer still succeeds; email error logged | Keep transfer success; queue retry for email notification |
| Logout token absent | Returns success | Keep idempotent logout behavior |
| Token expired/invalid | 401 Unauthorized | Keep |
| Blacklist TTL expires before JWT expiry | Token may become valid again if still unexpired | Align blacklist retention with JWT max lifetime or token versioning |
| Concurrent transfer bursts | Heavy contention worsened by 15-second delay | Remove delay + shorter transactions + request throttling |
| Network retries by client | Idempotency key can prevent duplicates | Keep, document required client behavior for stable keys |
| Large request body abuse | No request size guards in app config | Add explicit body size limits and rate limiting |

---

## 11) Interview Question Banks (with answers + what is tested + keywords + follow-ups)

Format per item:  
**Q** | **Strong answer** | **Interviewer tests** | **Keywords** | **Follow-ups**

### A) 20 Basic Project Questions
1. What does this backend do? | It provides auth, account management, and ledger-based money transfers with idempotency and auditability. | System understanding | ledger, transfer, idempotency | How is balance computed? Why ledger over mutable balance?
2. Why use a ledger model? | Ledger keeps immutable debit/credit history and allows balance derivation, improving traceability. | Data modeling clarity | immutable, audit trail | What are read-cost tradeoffs? How to optimize reads?
3. Which DB is used? | MongoDB with Mongoose schemas, refs, indexes, and transactions. | Stack awareness | MongoDB, Mongoose | Why not SQL? What constraints are harder in MongoDB?
4. How does authentication work? | JWT is issued on register/login, stored in cookie and optionally bearer header; middleware verifies and fetches user. | Auth flow clarity | JWT, middleware, cookie | Where is token revoked? Any gap in revocation?
5. What is account status used for? | Transfers require both accounts to be ACTIVE; FROZEN/CLOSED are blocked. | Business rule understanding | ACTIVE/FROZEN/CLOSED | Where is this check implemented?
6. What is idempotency key for? | Prevents duplicate transfer processing when client retries due to timeouts/network issues. | Reliability concepts | idempotency, retry safety | How is uniqueness enforced? What status should repeats return?
7. What email notifications exist? | Registration success and transaction success/failure email helpers via Nodemailer OAuth2. | Integration awareness | nodemailer, OAuth2 | Is email in critical path? Should it be async?
8. How is password stored? | Plain password is hashed via bcrypt in a pre-save hook; password is excluded from normal query selection. | Security basics | bcrypt, pre-save hook | Cost factor? Alternative algorithm?
9. Where are routes defined? | In `src/routes/*` and mounted in `src/app.js`. | Code navigation | express router | Which route is system-only?
10. What happens on logout? | Token is inserted into blacklist collection and cookie is cleared. | Token lifecycle | blacklist, revoke | How long blacklist entry lives?
11. How is balance fetched? | `account.getBalance()` aggregates ledger entries: credits minus debits. | Aggregation understanding | aggregate, credit-debit | Any scaling concern here?
12. What is the health endpoint? | `GET /` returns service status text. | API awareness | health check | Add readiness/liveness separately?
13. Is frontend included? | No, frontend is not implemented in this repository. | Scope honesty | backend-only | How would frontend integrate?
14. Is AI/ML included? | No AI/ML is implemented. | Scope honesty | not implemented | Where would AI fit if needed?
15. How are initial funds added? | A system-user-only endpoint creates transfer from system user account to target account. | Privileged flow understanding | system user, bootstrap funds | How is system user enforced?
16. What HTTP parser middleware is used? | `express.json()`, `express.urlencoded()`, and `cookie-parser`. | Middleware basics | request parsing | Missing security middleware?
17. Why status field in transactions? | To track lifecycle: PENDING, COMPLETED, FAILED, REVERSED. | State modeling | transaction status | How are failures transitioned today?
18. How are immutable ledgers enforced? | Schema fields are immutable and update/delete hooks throw errors. | Data integrity | immutable hooks | Any bypass risks?
19. What starts the server? | `server.js` loads env, connects DB, starts app on 3000. | Runtime understanding | bootstrap | What if DB connect fails?
20. Is automated test suite present? | No; `npm test` is placeholder and no automated tests are implemented. | Engineering maturity | test gap | Which tests would you add first?

### B) 20 Intermediate Technical Questions
1. Explain transfer transaction flow. | Validate input → idempotency check → account/status check → balance check → create PENDING transaction + debit + credit in session → mark COMPLETED → commit. | End-to-end reasoning | session, atomicity | Where can it fail?
2. Why use MongoDB transaction here? | Because transfer spans multiple documents that must commit atomically to avoid partial ledger state. | Consistency model | ACID, session | Performance cost?
3. How is idempotency race handled? | Unique index on `idempotencyKey` plus pre-check; though robust handling should catch duplicate key DB errors too. | Concurrency insight | unique index, race | Current code catches duplicate key explicitly?
4. What authorization bug exists? | Sender account ownership is not validated against `req.user`, so one user can potentially debit another user’s account. | Security depth | broken authorization | Exact fix approach?
5. Why is 15-second delay harmful? | It keeps transaction open longer, increases lock contention, and reduces throughput dramatically. | Performance diagnosis | long transaction, contention | Why might it have been added?
6. What is wrong with JWT vs blacklist TTL? | JWT lives 7 days but blacklist expires in 3 days, so logged-out tokens can revive before JWT expiry. | Token lifecycle depth | TTL mismatch | How to fix safely?
7. How would you handle session cleanup? | Use `try/catch/finally` with `abortTransaction()` in catch and `endSession()` in finally. | Reliability engineering | finally, abort | What if commit fails mid-flight?
8. How would you improve validation? | Add schema validation middleware (Joi/Zod/express-validator), objectId checks, amount bounds, and clear error codes. | API robustness | validation layer | Why not only Mongoose validation?
9. Should email be inside request flow? | No; commit DB first then enqueue async email to avoid increasing API latency and failure coupling. | Decoupling | queue, eventual consistency | How to guarantee at-least-once email?
10. How does blacklist check work? | Middleware checks token existence in `tokenBlackList` before JWT verify and user fetch. | Middleware comprehension | blacklist lookup | Cost at high QPS?
11. Why have `systemUser` hidden by default? | To reduce accidental leakage and enforce explicit selection when needed. | Data exposure awareness | select:false | Any downside?
12. What does immutable ledger buy you? | Stronger audit integrity and easier forensic tracking of balance evolution. | Auditability | append-only ledger | How to correct mistaken transaction?
13. How to model reversals? | Create compensating transaction + opposite ledger entries; keep original immutable. | Domain correctness | compensation | Is `REVERSED` enough alone?
14. How to prevent double spend under concurrency? | Keep transaction short, use consistent checks+writes in single transaction, and consider account-level locking strategy or optimistic checks. | Concurrency control | isolation | Does current code fully prevent it?
15. Where are indexes today? | Account `(user,status)`, refs on account/transaction docs, unique `idempotencyKey`, blacklist TTL index. | DB awareness | index strategy | Which extra index next?
16. How to scale reads of balance? | Maintain materialized balance snapshot updated atomically with ledger writes; keep ledger for audit. | Scalability design | CQRS, snapshot | Consistency risk?
17. How to secure cookies better? | Set `httpOnly`, `secure`, `sameSite`, explicit maxAge, and CSRF strategy. | Web security practicals | cookie flags | Is current code setting them?
18. What missing perimeter controls? | CORS policy, security headers, and rate limiting are not configured. | Defense-in-depth | CORS, helmet, limiter | Priority order?
19. Why no multer usage matters? | Unused dependency can increase maintenance and vulnerability surface without utility. | Supply-chain thinking | attack surface | Remove or integrate?
20. What observability is missing? | Structured logs, request IDs, metrics, tracing, and alerting for DB/email failures. | Production readiness | SRE basics | First metrics to add?

### C) 20 Advanced Questions
1. How would you design exactly-once transfer semantics? | Use idempotency key with unique index, transactional outbox/eventing, and deterministic replay responses. | Distributed consistency | exactly-once, outbox | Why impossible in pure distributed terms?
2. How to harden against replay attacks? | Bind token usage context, short token TTL + refresh rotation, and nonce/idempotency on critical operations. | Threat modeling | replay mitigation | Is blacklist enough?
3. How to migrate to multi-currency safely? | Add currency per account/ledger entry, enforce same-currency transfer or FX service with separate booking entries. | Domain evolution | multi-currency | What audit fields required?
4. How would you partition ledger at scale? | Partition by account or time bucket with consistent routing, while preserving query patterns for balance and statements. | Data architecture | sharding | Cross-partition transaction implications?
5. How to ensure audit non-repudiation? | Immutable logs, append-only ledger, cryptographic hash chain of entries, and restricted privileged access. | Compliance mindset | tamper evidence | Practical in MongoDB?
6. Can unique idempotency key alone stop duplicates? | It stops duplicate inserts but API must also handle retry responses and race-induced duplicate-key errors gracefully. | Edge-case rigor | duplicate key handling | Current implementation gap?
7. How to reduce transfer p99 latency? | Remove artificial delay, avoid synchronous email, optimize indexes, and reduce network hops. | Performance tuning | p99, latency budget | Measure before/after कैसे?
8. How to design compensation for partial external failures? | Commit ledger first, then outbox event for email/notifications with retries and dead-letter queue. | Transaction boundary | eventual consistency | Where to store retry state?
9. What consistency level do clients observe? | Strong for committed transfer docs within primary DB view; eventual for side effects like email. | Consistency semantics | read-your-write | Replica lag effects?
10. How would you test race conditions? | Concurrent load tests with same/different idempotency keys, chaos around DB/network errors, assert final invariants. | Testing depth | concurrency tests | Core invariants list?
11. What invariant checks are essential? | Sum(debits/credits) per transaction pair, no orphan ledger rows, transaction status aligns with ledger existence. | Data integrity | invariants | Online checker design?
12. How to support statements/history endpoint? | Add paginated ledger/transaction query endpoints with account ownership filters and indexes. | API product design | pagination, filtering | Anti-enumeration controls?
13. How to avoid authorization drift? | Central policy layer and reusable ownership checks per route/controller. | Secure architecture | policy enforcement | Unit tests for authorization?
14. How to handle idempotency key expiration? | Store creation timestamp + retention policy; reject stale keys or archive safely. | Lifecycle design | retention | Client contract impact?
15. How to make blacklist scalable? | Move to Redis with TTL and O(1) lookup, or switch to short-lived access + refresh-token rotation model. | Scalability/security | Redis blacklist | Failure mode on cache miss?
16. Should transaction store include request hash? | Yes, to ensure same idempotency key is not reused with different payload. | API safety | idempotency payload binding | Current code does this?
17. How to make system-user flow safer? | Dedicated service account with scoped permissions and separate secret rotation policy. | Privilege design | least privilege | Audit for privileged calls?
18. What is strongest argument against current delay? | It violates atomic path efficiency and can trigger transaction timeouts/throughput collapse under load. | Critical thinking | throughput collapse | Quantify impact quickly?
19. How to retrofit zero-trust for internal APIs? | mTLS/service identity, strict authZ policies, audit trails, and secret management hardening. | Security architecture | zero trust | Necessary for this scope?
20. What would production-readiness checklist include? | Tests, security middleware, validation, observability, deployment strategy, backup/restore drills, SLOs. | Ownership maturity | production checklist | First 3 fixes?

### D) 15 “Why did you use X?” Questions
1. Why Express? | Lightweight and fast to implement REST routes. | Framework choice | Express, middleware | Why not NestJS?
2. Why MongoDB? | Flexible schema and quick iteration for document-centric model. | DB rationale | document store | Why not PostgreSQL?
3. Why Mongoose? | Schema validation, hooks, refs, and transaction/session API ergonomics. | ORM/ODM choice | ODM | ODM drawbacks?
4. Why JWT? | Stateless auth for horizontally scalable APIs. | Auth strategy | JWT | Revocation challenge?
5. Why bcrypt? | Secure password hashing with configurable cost. | Password security | salted hash | Why not Argon2?
6. Why idempotency key? | Safe retries without duplicate monetary transfer. | API resilience | idempotent API | Key collision handling?
7. Why transaction status enum? | Tracks lifecycle and recovery paths. | State modeling | PENDING/COMPLETED | Missing states?
8. Why immutable ledger docs? | Protect audit trail from mutation. | Integrity | immutable | How reverse entries?
9. Why blacklist model? | Immediate logout invalidation for issued JWTs. | Token revocation | blacklist | TTL mismatch issue?
10. Why cookie parser? | Reads auth token from cookies in middleware. | Middleware choice | cookies | Security flags missing?
11. Why OAuth2 for Gmail? | Avoids plain password SMTP auth and supports secure token-based email. | Integration security | OAuth2 | Token expiry handling?
12. Why account statuses? | Business control for freezing/closing accounts. | Domain design | status gating | Who changes status currently?
13. Why separate system-user middleware? | Enforces privileged route access boundaries. | Authorization architecture | role check | Is RBAC complete?
14. Why aggregate for balance? | Computes from source-of-truth ledger entries. | Data correctness | aggregate balance | Read latency downside?
15. Why unique idempotency index at DB level? | Last-line protection against duplicates under race conditions. | Concurrency correctness | unique index | Need payload hash too?

### E) 15 “What if X fails?” Questions
1. What if DB commit fails? | Transfer should abort and return retry-safe error; currently abort handling is incomplete. | Failure handling | abortTransaction | How to make deterministic?
2. What if credit entry fails after debit? | In a proper transaction both should rollback; long sessions increase risk/timeouts. | Atomicity | rollback | Current catch cleanup?
3. What if email service is down? | Core transfer should still succeed; notification should retry async. | Side-effect decoupling | async email | Current behavior?
4. What if same idempotency key is reused with different payload? | Should reject as conflict; current code doesn’t compare payload hash. | API integrity | idempotency misuse | Implementation plan?
5. What if JWT secret is rotated? | Existing tokens invalidate unless multi-key verify strategy exists. | Key management | secret rotation | How to implement seamless rotation?
6. What if blacklist DB unavailable? | Auth should fail closed for safety or use resilient cache strategy. | Secure failure mode | fail closed | Availability tradeoff?
7. What if user token expires mid-session? | API returns 401 and client reauth flow should trigger. | Session lifecycle | token expiry | Refresh token design?
8. What if ObjectId format invalid? | Should return 400 early; current code may rely on Mongoose cast errors. | Input hygiene | ObjectId validation | Where to centralize?
9. What if system user has no account? | Initial-funds endpoint returns 400 “System user account not found”. | Edge-case reading | bootstrap account | Better operational control?
10. What if transfer amount is negative? | Mongoose min on amount prevents negatives at model level; still validate earlier. | Validation layering | min constraint | Zero-amount allowed?
11. What if app restarts during transfer? | In-flight transaction may roll back; idempotency allows safe retry when implemented robustly. | Crash recovery | retry safety | Any reconciliation job?
12. What if two concurrent debits pass balance check? | Race risk exists if checks and writes not tightly serialized by DB semantics and short sessions. | Concurrency danger | double spend | Mitigation options?
13. What if logout called repeatedly? | Endpoint returns success; with token present it tries blacklist insert (unique token). | Idempotent logout | duplicate blacklist | Handle duplicate insert gracefully?
14. What if nodemailer auth token expires? | Email send fails and logs error; should include token refresh monitoring/retry policy. | External dependency handling | OAuth refresh | Alerting mechanism?
15. What if request flood hits transfer API? | Currently no rate limiting; service can be abused/overloaded. | Abuse resistance | rate limiting | Where to enforce limits?

### F) 10 Scalability Questions
1. How to scale write-heavy transfers? | Remove delay, keep transactions short, shard wisely, and decouple non-critical work. | Write scaling | short tx, queue | First bottleneck now?
2. How to scale balance reads? | Materialized balance snapshots plus periodic reconciliation against ledger. | Read optimization | snapshot, reconciliation | Consistency guarantees?
3. How to handle 100k users? | Horizontal app scaling + DB capacity planning + observability-driven tuning. | Capacity planning | autoscale | Which metric drives scaling?
4. What queue would you add? | BullMQ/RabbitMQ/SQS for email and async tasks. | Async architecture | job queue | Retry/backoff policy?
5. How to reduce DB load from auth? | Use short-lived access tokens + refresh, cache blacklist checks where safe. | Auth scaling | cache, token strategy | Security tradeoffs?
6. How to optimize transaction queries? | Add indexed pagination endpoints and projection-limited reads. | Query tuning | indexes, pagination | Cursor vs offset?
7. How to prevent hot accounts bottleneck? | Account-level throttling/locking strategy and prioritized processing. | Contention control | hot key | Fairness policies?
8. How to scale email notifications? | Outbox + worker fleet + DLQ + provider fallback. | Reliability at scale | outbox, DLQ | Idempotent email keys?
9. How to monitor scalability health? | Track p95/p99 latency, tx commit time, error rate, queue lag, DB CPU/locks. | SRE literacy | SLI/SLO | Alert thresholds?
10. How to run load tests? | Use k6/JMeter scenarios for login/account/transfer mixes and concurrency spikes. | Performance methodology | load test profiles | Success criteria?

### G) 10 Security Questions
1. Biggest security bug now? | Missing ownership validation on `fromAccount` in transfer endpoint. | Threat identification | IDOR/BOLA | Exact exploit path?
2. Is logout secure with current TTL? | Not fully; 7-day JWT vs 3-day blacklist TTL can re-enable old token. | Token revocation depth | TTL mismatch | Best fix pattern?
3. Are cookies hardened? | Not explicitly (`httpOnly/secure/sameSite` flags not set in code). | Practical hardening | cookie flags | CSRF implications?
4. Is CSRF mitigated? | Not explicitly. Cookie-based auth requires CSRF defense if browser clients are used. | Web security depth | CSRF token | Alternate auth model?
5. Is brute-force login protected? | No rate limiting/lockout implemented. | Abuse mitigation | limiter, lockout | User experience tradeoff?
6. Is input sanitized? | Minimal manual checks only; no centralized schema validation/sanitization. | Input validation depth | Joi/Zod | Validation location?
7. Is sensitive data exposure controlled? | Password hidden by select:false; but logs/error outputs need tighter controls. | Data protection | least exposure | Logging policy?
8. Is RBAC implemented? | Only system-user boolean gate for one route; no broader role model. | Authorization design | RBAC gap | When to add roles?
9. Is dependency security managed? | No visible pipeline in repo; unused multer should be removed if unnecessary. | Supply-chain awareness | dependency hygiene | How to enforce scans?
10. Is transport security configured? | TLS termination/config is not present in repo (deployment concern not implemented). | Environment awareness | TLS offload | What to document?

### H) 10 Database Questions
1. Why ledger + transaction tables both? | Transaction captures business intent/status; ledger captures immutable accounting entries. | Modeling clarity | intent vs accounting | Could one table suffice?
2. How is balance calculated in DB? | Aggregation groups debit/credit amounts and subtracts totals. | Aggregation understanding | `$group`, `$project` | Index effects?
3. Why index idempotency key? | Fast lookup and uniqueness guarantee for replay-safe transfers. | Index rationale | unique index | Error handling on duplicate key?
4. Why index account user/status? | Efficient retrieval of user accounts and status-based filters. | Query planning | compound index | Additional index ideas?
5. How to optimize ledger aggregate? | Index account+type, maintain snapshots, and reduce full-scan aggregations. | DB performance | covered queries | Snapshot drift handling?
6. What transaction isolation assumptions exist? | Relies on MongoDB transaction semantics for atomic multi-doc writes. | Consistency depth | ACID in Mongo | Version/cluster prerequisites?
7. How to detect data corruption? | Periodic reconciliation jobs enforcing invariants across transactions and ledgers. | Data quality | reconciliation | What invariants first?
8. How to archive old ledger data? | Time-based archival partitions with read replicas/data lake export for long-term analytics. | Data lifecycle | archival | Audit retention constraints?
9. How to model reversal properly? | Insert compensating ledger entries linked to reversal transaction id. | Accounting correctness | compensating entries | Why not delete original?
10. How to handle sharding strategy? | Prefer account-based shard key to localize balance/ledger operations. | Distributed DB design | shard key | Cross-account transfer impact?

---

## 12) Cross-Questions Strategy (strict interviewer mode)

Use this response pattern for almost any follow-up:
1. Restate invariant (“No money moves without two immutable entries and a statused transaction record.”)
2. Explain current implementation factually.
3. Acknowledge gap openly.
4. Give concrete fix and expected impact.

High-frequency follow-ups you should expect:
- “Show me exactly where ownership is enforced.” (Current answer: not enforced in transfer; propose check before balance computation.)
- “What happens if retry arrives during pending state?” (Current answer: returns processing message.)
- “How do you prove no partial transfer?” (Current answer: intended via MongoDB session, but cleanup/abort path should be strengthened.)
- “How would you make this production ready in one week?” (Prioritize ownership auth bug, remove 15s delay, add validation/security middleware, add tests.)

---

## 13) Resume-Specific Question Guidance

Because your actual resume text is not provided here, use only claims verifiable from code:

1. “Built JWT auth backend” → Be ready to explain blacklist and TTL mismatch.
2. “Implemented money transfer API” → Explain idempotency, transaction status, and ledger writes.
3. “Designed ledger architecture” → Explain immutable debit/credit and balance aggregation.
4. “Used MongoDB transactions” → Explain why multi-document atomicity is needed.
5. “Added role-based access” → Clarify only a system-user boolean guard is implemented.
6. “Integrated email notifications” → Explain OAuth2 nodemailer and why it should move async.
7. “Handled security” → Mention implemented controls + explicit gaps and remediation priorities.
8. “Improved scalability” → Be honest: current 15-second delay hurts scalability; describe your improvement plan.
9. “Wrote robust tests” → Do not claim; tests are missing in current repo.
10. “Built full-stack app” → Do not claim frontend for this repository.

---

## 14) Likely Contribution You Can Claim Confidently

Based on current code, safe contribution statements:
- Implemented/maintained Express route structure for auth, account, and transactions.
- Implemented Mongoose models for user/account/transaction/ledger/blacklist.
- Implemented idempotency-key transfer flow and MongoDB transaction usage.
- Added system-user-protected initial funds endpoint.
- Added email service integration for registration and transaction notifications.

Do **not** claim:
- Frontend development.
- AI/ML features.
- Complete production-grade security.
- Comprehensive automated testing framework.

---

## 15) Project Pitch Scripts

### 30-second pitch
“This is a Node.js/Express banking ledger backend where money movement is recorded as immutable debit/credit ledger entries, not direct balance mutation. I implemented JWT auth, account APIs, and idempotent transfer APIs using MongoDB transactions so retries don’t duplicate transfers. It also has system-user initial funding and email notifications. I can clearly explain current gaps like sender ownership validation and security hardening needed for production.”

### 60-second pitch
“I built a backend-focused Banking Ledger System using Express and MongoDB. Users register/login with JWT, create accounts, check balances, and transfer funds. The key design choice is an immutable ledger: each transfer writes debit and credit entries and derives balances from history. Transfers use an idempotency key plus transaction status to handle client retries safely. There’s also a privileged endpoint for initial funding by a system user. The implementation is strong for demonstrating ledger concepts, but I can also discuss gaps I identified—like missing sender-account ownership validation, JWT-blacklist TTL mismatch, and missing rate limiting/CORS/security headers—and how I’d fix them for production.”

### 2-minute pitch
“This project is a backend ledger service designed around accounting-style correctness. Instead of storing mutable balances, every transfer creates immutable ledger entries—one debit and one credit—linked to a transaction document with lifecycle states like PENDING and COMPLETED. The stack is Node.js, Express, MongoDB, and Mongoose.  

The user flow is: register/login with JWT, create accounts, then initiate transfers with an idempotency key. The idempotency key, backed by a unique index, prevents duplicate financial effects when clients retry due to network failures. For privileged bootstrapping, there is a system-user-only initial-funds endpoint.  

Security-wise, the app has bcrypt password hashing, route protection middleware, and token blacklisting on logout. I can also articulate limitations transparently: transfer authorization currently does not enforce that `fromAccount` belongs to the logged-in user, JWTs are valid for seven days while blacklist entries expire in three, and API hardening middleware like CORS/security headers/rate limiting is missing.  

From a performance perspective, there’s an intentional 15-second delay inside the transfer transaction that is useful to discuss as an anti-pattern because it increases contention and kills throughput. My production plan is to remove that delay, move email to async queues, add centralized request validation, fix transaction abort/session cleanup paths, add automated tests, and introduce observability and security controls.”

---

## Implementation Gaps Checklist (explicit call-outs requested)

- [x] Missing sender-account ownership validation in transfers.
- [x] 15-second delay inside MongoDB transaction.
- [x] Incomplete transaction abort/session cleanup.
- [x] JWT seven-day lifetime versus three-day blacklist TTL mismatch.
- [x] Missing automated tests.
- [x] Missing CORS/security headers/rate limiting.
- [x] Unused multer dependency.

