# KAIRO
### *Act at the right moment. Secure from the first line.*

> From the Greek *kairos* — not clock time, but the perfect decisive moment. The instant when conditions align and the right action must happen. Kairo acts at that moment. Invisible before it. Irreversible after it.

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [The One Rule](#2-the-one-rule)
3. [How Kairo Is Different](#3-how-kairo-is-different)
4. [Tech Stack](#4-tech-stack)
5. [Architecture Overview](#5-architecture-overview)
6. [Layer 1 — Request Membrane](#6-layer-1--request-membrane)
7. [Layer 2 — Intent Engine](#7-layer-2--intent-engine)
8. [Layer 3 — Trust Lattice](#8-layer-3--trust-lattice)
9. [Layer 4 — Data Shield](#9-layer-4--data-shield)
10. [Layer 5 — Runtime Sentinel](#10-layer-5--runtime-sentinel)
11. [Layer 6 — Developer Experience Layer](#11-layer-6--developer-experience-layer)
12. [Layer 7 — Hardening Mode](#12-layer-7--hardening-mode)
13. [The Flexibility Contract](#13-the-flexibility-contract)
14. [Security Wrapping — How It Works](#14-security-wrapping--how-it-works)
15. [Routing](#15-routing)
16. [Middleware](#16-middleware)
17. [Authentication & Authorization](#17-authentication--authorization)
18. [Database Layer](#18-database-layer)
19. [Validation](#19-validation)
20. [Error Handling](#20-error-handling)
21. [File Uploads](#21-file-uploads)
22. [WebSockets](#22-websockets)
23. [Rate Limiting](#23-rate-limiting)
24. [Logging & Observability](#24-logging--observability)
25. [Environment & Secrets](#25-environment--secrets)
26. [Testing](#26-testing)
27. [CLI — kairo](#27-cli--kairo)
28. [MCP Suite — kairo-mcp](#28-mcp-suite--kairo-mcp)
29. [Plugin System](#29-plugin-system)
30. [Performance](#30-performance)
31. [Deployment](#31-deployment)
32. [Roadmap](#32-roadmap)
33. [Contributing](#33-contributing)
34. [Glossary](#34-glossary)

---

## 1. Philosophy

Most frameworks treat security as a feature. Something you add. A middleware you install, a library you configure, a checklist you run through before launch. The result: security is always playing catch-up with the developer's imagination.

Kairo inverts this completely.

**Security in Kairo is not a feature. It is the substrate.**

The framework does not restrict what developers build. It wraps security around whatever they build — like water finding the shape of its container. The developer's intent is always honored. Kairo's job is to make sure that intent cannot be weaponized against the developer, their users, or their infrastructure.

This produces a framework with three defining characteristics:

**1. Zero friction for the developer.**
No security gates. No "you cannot do this." No forced patterns. Write your code the way you think. Kairo adapts to you.

**2. Adaptive security that forms around your code.**
Security is not applied to routes. It is formed around them — shaped by context, intent, and runtime behavior. An endpoint that handles money gets different protection than one that serves static content. Automatically. Without configuration.

**3. Hardens under attack, relaxes under normal use.**
Normal traffic feels nothing. Kairo operates silently. The moment attack patterns emerge, the framework tightens — elastically, proportionally, without dropping legitimate requests.

---

## 2. The One Rule

> **Kairo never says no to the developer. It says "yes, and here is how I made that safe."**

This is the single governing principle from which every design decision flows.

If a developer wants to build an endpoint that accepts arbitrary file uploads — Kairo allows it, and wraps it in content-type validation, virus scanning, entropy checking, and sandboxed storage automatically.

If a developer wants to disable a security layer — Kairo allows it, records the override with a reason in the audit log, and compensates by tightening adjacent protections.

If a developer does something unconventional — Kairo adapts its threat model to that convention rather than refusing it.

The security forms around the code. The code never forms around the security.

---

## 3. How Kairo Is Different

| | Express | Koa | Fastify | **Kairo** |
|---|---|---|---|---|
| Security model | Bolt-on middleware | Bolt-on middleware | Bolt-on plugins | Runtime substrate |
| Default security | None | None | Minimal | Full |
| Developer restrictions | None | None | None | None |
| Adaptive hardening | No | No | No | Yes |
| Intent declaration | No | No | No | Yes |
| Taint tracking | No | No | No | Yes |
| Ghost routes / honeypots | No | No | No | Yes |
| Behavioral biometrics | No | No | No | Yes |
| Hot-patch bus | No | No | No | Yes |
| MCP integration | No | No | No | Yes |
| Teaches developer | No | No | No | Yes |
| Bundle size | ~200KB | ~30KB | ~80KB | **~45KB** |

---

## 4. Tech Stack

### Core Runtime
- **Language:** TypeScript 5.x (strict mode, full type inference)
- **HTTP Engine:** `uWebSockets.js` (uWS) — the fastest HTTP server in the Node.js ecosystem, ~8x faster than Express under load
- **Fallback:** Native `node:http` for environments where uWS cannot be compiled
- **Node.js:** 20 LTS minimum, 22 LTS recommended
- **Module system:** ESM-first, CommonJS compatible via dual exports

### Security Internals
- **Taint tracking:** Custom AST-level runtime instrumentation (no V8 flags required)
- **Cryptography:** Node.js native `node:crypto` — no third-party crypto dependencies
- **Token system:** Custom temporal JWT implementation with decay curves
- **Zero-knowledge proofs:** `snarkjs` (optional, tree-shaken when unused)
- **Entropy scoring:** Custom statistical engine, inline, no ML model dependency

### Data Layer
- **ORM adapter:** Database-agnostic adapter interface — works with Prisma, Drizzle, TypeORM, raw SQL, MongoDB, or anything else
- **Field encryption:** AES-256-GCM at rest, enforced by the ORM adapter layer
- **Query analysis:** Static analysis on query objects before execution — detects injection patterns without regex

### Developer Tooling
- **CLI:** `@kairo/cli` — standalone binary via `pkgroll`, no global Node dependency required
- **MCP server:** `@kairo/mcp` — implements MCP protocol over stdio and SSE
- **Dev server:** Built-in with HMR, security coaching output, and live attack surface display
- **Type generation:** Automatic route type generation from intent declarations

### Build System
- **Bundler:** `tsup` (esbuild-based) for the framework itself
- **Tree shaking:** Every layer is independently tree-shakeable
- **Zero mandatory peer dependencies** — the entire core ships in one package

### Testing
- **Test runner:** Works with Vitest, Jest, or any runner
- **Built-in:** `@kairo/test` — security-specific test utilities (fuzz helpers, taint injection, entropy simulation)

---

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        INCOMING REQUEST                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1 · REQUEST MEMBRANE                                  │
│  Entropy scoring · Ghost route detection · Payload envelope  │
│  Behavioral fingerprinting · Anomaly baselining              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2 · INTENT ENGINE                                     │
│  Route intent resolution · Behavioral contract validation    │
│  Zero-trust intent graph · Semantic drift detection          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3 · TRUST LATTICE                                     │
│  Relationship-graph auth · Temporal tokens · Step-up auth    │
│  Behavioral biometrics · Zero-knowledge proof verification   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  DEVELOPER CODE                                              │
│  Your handlers · Your logic · Your freedom                   │
│  Kairo wraps around this. Never inside it.                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4 · DATA SHIELD                                       │
│  Field encryption · Contextual redaction · Poison pills      │
│  Differential privacy · Query injection analysis             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 5 · RUNTIME SENTINEL                                  │
│  Taint tracking · Canary frames · Hot-patch bus              │
│  Memory pressure alarms · Prototype pollution detection       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 6 · DEVELOPER EXPERIENCE                              │
│  Inline coaching · Audit mode · Security budget dashboard    │
│  Override recording · Scaffolding-born-secure                │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 7 · HARDENING MODE   (dormant until triggered)        │
│  Elastic rate limits · Shadow execution · Stealth deflection │
│  Circuit breaker mesh · Attacker ghost environment           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        OUTGOING RESPONSE                     │
└─────────────────────────────────────────────────────────────┘
```

Every layer is independently configurable. Every layer can be extended. No layer can be removed entirely — but any layer can be made transparent (pass-through) for a specific route, with that override recorded in the audit log.

---

## 6. Layer 1 — Request Membrane

The Request Membrane is the first thing every request touches. It is not a validator. It is not a firewall. It is a living, adaptive boundary that learns the shape of normal traffic and silently flags everything that deviates.

### Entropy Scoring

Every request receives an entropy score computed from:

- Payload structure (field names, nesting depth, value entropy)
- Timing characteristics (inter-request interval, time-of-day baseline)
- Header fingerprint (User-Agent consistency, encoding anomalies)
- IP behavioral history (rolling 15-minute window)
- Parameter pattern (URL structure, query string shape)

The entropy score is a float between 0.0 (perfectly normal) and 1.0 (maximally anomalous). It flows through all seven layers as part of the request context. Higher scores cause downstream layers to tighten proportionally.

```typescript
// Entropy score is available in every handler
app.get('/payments', (ctx) => {
  console.log(ctx.kairo.entropy) // e.g. 0.12 (normal)
  // Your code here — unchanged, unrestricted
})
```

### Ghost Routes

Ghost routes are endpoints that exist in the framework's routing table but are never declared by the developer. They are automatically generated based on common scanner patterns (e.g. `/.env`, `/wp-admin`, `/api/v1/admin/users`, `/config.json`).

Any request to a ghost route:
1. Receives a plausible, syntactically valid fake response
2. Permanently elevates the entropy score for that IP
3. Logs a silent alert to the security event stream
4. Does not reveal itself as a trap — ever

Ghost routes are on by default. They require zero configuration.

```typescript
// Optional: add your own ghost routes
app.ghost('/internal/debug', {
  response: { status: 'ok', debug: false },
  alertLevel: 'high'
})
```

### Signed Payload Envelope

Requests arriving from Kairo-to-Kairo service calls are wrapped in a signed cryptographic envelope — a lightweight HMAC over the payload, timestamp, and originating service identity. The membrane verifies this envelope before the request enters the intent engine.

For external requests (browsers, third-party clients) the envelope is not required — the membrane falls back to entropy scoring and behavioral analysis.

### Behavioral Fingerprinting

The membrane builds a rolling behavioral fingerprint for each session — not using cookies or tracking headers, but from the statistical pattern of requests: timing, ordering, field access patterns. This fingerprint is used to detect session hijacking and credential stuffing silently.

---

## 7. Layer 2 — Intent Engine

The Intent Engine is Kairo's most novel layer. It addresses a problem no framework has solved: **the gap between what a route says it does and what it actually does.**

### Intent Declaration

Routes in Kairo can optionally declare their intent in a DSL string alongside the handler:

```typescript
app.post('/transfer', {
  intent: 'transfer funds between two user accounts',
  handler: async (ctx) => {
    // your code
  }
})
```

This intent declaration is not documentation. It is a runtime contract. The Intent Engine monitors the handler's actual behavior — what data it reads, what it writes, what services it calls — and validates that behavior against the declared intent.

If the handler begins doing something inconsistent with its declared intent (e.g. reading user records beyond the transaction parties, calling external services not involved in a funds transfer), the Intent Engine logs a behavioral drift alert. In production, it can be configured to quarantine the handler pending review.

This catches a class of attack that no other framework addresses: **supply chain compromises and insider threats that modify handler behavior without changing route declarations.**

### Zero-Trust Intent Graph

Every service-to-service call is registered in the Intent Graph — a directed graph of which services call which other services, for which declared purpose. The graph is built automatically from runtime observation during development and seeded into the deployment.

In production, any call that falls outside the observed intent graph triggers an alert. The call is not blocked — Kairo never blocks the developer — but it is flagged, logged, and the entropy score of the originating service rises.

```typescript
// Declare inter-service trust explicitly
app.trust({
  service: 'payment-service',
  may_call: ['ledger-service', 'notification-service'],
  for: 'processing payment transactions'
})
```

### Semantic Route Guards

Route guards in Kairo are not boolean middleware functions. They are semantic declarations:

```typescript
app.get('/admin/users', {
  requires: 'administrative access to user records',
  handler: async (ctx) => {
    // your code — Kairo resolves "administrative access to user records"
    // against the Trust Lattice at runtime
  }
})
```

The guard is evaluated against the Trust Lattice (Layer 3) using the declared semantic meaning, not a hardcoded role name. This means your authorization logic does not need to change when your role structure changes — only the Trust Lattice mapping changes.

---

## 8. Layer 3 — Trust Lattice

The Trust Lattice replaces traditional role-based access control with something more expressive: **relationship-graph-based access with temporal decay.**

### Why Not RBAC

Role-based access control has one fundamental problem: roles are static. A user either has a role or does not. But real authorization is contextual. A user may be allowed to read a record because they created it, or because they are assigned to the project it belongs to, or because they have been temporarily delegated access, or because the record belongs to a subordinate in their org chart.

Expressing all of this in static roles produces either a combinatorial explosion of roles or a leaky over-permissioned system.

The Trust Lattice expresses authorization as **relationships between entities** in a graph:

```typescript
app.lattice.define({
  // "A user can access a resource if they own it"
  owns: (user, resource) => resource.ownerId === user.id,

  // "A user can access a resource if they are a member of its project"
  memberOf: async (user, resource) => {
    return db.projectMembers.exists({ userId: user.id, projectId: resource.projectId })
  },

  // "A manager can access resources owned by their reports"
  manages: async (user, resource) => {
    return orgGraph.isReportOf(resource.ownerId, user.id)
  }
})
```

Authorization checks reference these relationships by name:

```typescript
app.get('/documents/:id', {
  requires: 'owns | memberOf | manages',
  handler: async (ctx) => { ... }
})
```

### Temporal Tokens

Tokens in Kairo carry a risk profile, not just an expiry time. The token's effective validity decays based on the risk level of actions performed:

- Reading public data: no decay
- Reading sensitive data: slow decay
- Writing financial records: fast decay — re-authentication required within N minutes
- Administrative actions: immediate step-up required regardless of token age

This means a token that is technically valid can require step-up authentication for high-risk routes without the developer writing any logic for it:

```typescript
app.delete('/accounts/:id', {
  risk: 'high',
  // That's it. Kairo handles step-up auth for high-risk routes automatically.
  handler: async (ctx) => { ... }
})
```

### Behavioral Biometrics

For browser clients, the Trust Lattice builds a silent behavioral signature from typing rhythm, scroll behavior, click patterns, and pointer movement. This signature is never sent to the server in raw form — it is hashed and compared against the session's established baseline.

A significant deviation from the baseline (which can indicate session theft after authentication) triggers a silent step-up verification request.

This is entirely transparent to the developer. It requires no configuration and produces no code changes.

### Override Freedom

A developer can bypass the Trust Lattice entirely for any route:

```typescript
app.get('/public/health', {
  trust: 'none', // No auth, no lattice check
  reason: 'Public health check endpoint — no sensitive data',
  handler: async (ctx) => ctx.json({ status: 'ok' })
})
```

The `reason` is logged to the audit trail. The framework does not complain, does not warn, does not add friction. It records and moves on.

---

## 9. Layer 4 — Data Shield

The Data Shield protects data at rest, in transit, and in response — without the developer having to think about any of it.

### Field-Level Encryption

Encryption is declared in the model definition, not in the handler:

```typescript
import { defineModel } from '@kairo/data'

const User = defineModel({
  id: field.uuid(),
  email: field.string().encrypted(),         // AES-256-GCM at rest
  ssn: field.string().encrypted().redacted(), // Encrypted + never sent in responses
  name: field.string(),
  role: field.string()
})
```

The framework's ORM adapter layer intercepts all reads and writes to encrypted fields, handling encryption and decryption transparently. The developer reads and writes plain values. Kairo handles the cryptographic layer.

### Contextual Redaction

The same route returns different fields to different callers based on their Trust Lattice context:

```typescript
const User = defineModel({
  id: field.uuid(),
  name: field.string(),
  email: field.string().visibleTo('owns | manages'),
  ssn: field.string().encrypted().visibleTo('admin'),
  salary: field.string().encrypted().visibleTo('hr | manages')
})
```

When a handler returns a User object, Kairo automatically strips fields the caller is not permitted to see. The developer does not write any filtering logic. They return the full object. Kairo shapes the response.

### Poison Pill Records

Poison pill records are synthetic database entries seeded automatically by the Data Shield across every table. They look identical to real records. They will never appear in legitimate application queries because they are seeded outside the ID ranges and patterns used by the application.

Any query that returns a poison pill record — which can only happen during bulk extraction or full-table scans — fires a high-severity alert and elevates the entropy score of the originating session to maximum.

The developer does not configure this. It requires no schema changes. Kairo manages the synthetic records entirely.

```typescript
// Optional: configure poison pill density
app.shield.poisonPills({
  density: 'medium', // low | medium | high
  tables: 'all'      // or ['users', 'payments']
})
```

### Differential Privacy on Aggregates

Statistical queries that aggregate sensitive fields automatically receive calibrated noise injection using the Laplace mechanism — making bulk statistical extraction mathematically impractical while individual queries remain accurate:

```typescript
// Developer writes this
const avgSalary = await db.users.aggregate({ avg: 'salary' })

// Kairo returns a differentially private result automatically
// The noise is calibrated to the sensitivity of the field
// Individual lookups are unaffected
```

### Query Injection Analysis

Before any query reaches the database, Kairo performs structural analysis on the query object — not regex pattern matching on strings, but AST-level analysis of the query structure itself. Injected payloads that alter query structure are detected and the query is neutralized. The handler receives an empty result set, not an error — unless the developer configures otherwise.

---

## 10. Layer 5 — Runtime Sentinel

The Runtime Sentinel is Kairo's active watchdog. It runs alongside the application at negligible performance cost and monitors the runtime state of every request.

### Taint Tracking

Every value that originates from user input — request body, query parameters, headers, file uploads, WebSocket messages — is tagged at the entry point with a taint marker.

This taint marker propagates through every function call, assignment, and transformation. If tainted data reaches a dangerous sink — a database query, a shell command, a file path, an HTML template, a redirect target — without passing through a recognized sanitization function, the Sentinel intercepts.

The interception does not throw an error to the user. The operation is silently neutralized and a security event is logged. If the same pattern repeats from the same session, the entropy score rises accordingly.

```typescript
// Developer writes this — no sanitization, no special handling
app.get('/search', async (ctx) => {
  const results = await db.query(`SELECT * FROM products WHERE name LIKE '%${ctx.query.q}%'`)
  ctx.json(results)
})

// Kairo intercepts: ctx.query.q is tainted, reaching a raw SQL sink
// The query is neutralized. The developer receives a coaching message at dev time.
// In production: silent neutralization + security event log.
```

Kairo does not refuse to run the handler. It neutralizes the dangerous operation and records it.

### Canary Stack Frames

Kairo inserts invisible synthetic frames into the JavaScript call stack at key points during request handling. These frames are structurally designed to detect:

- **Prototype pollution:** Modifications to `Object.prototype` or `Array.prototype` mid-request
- **Stack smashing:** Attempts to unwind the call stack past expected boundaries
- **Eval injection:** Dynamic code evaluation from tainted sources

Canary frames are zero-cost when nothing is wrong. They fire only when tampering is detected.

### Hot-Patch Bus

Kairo operates a signed hot-patch bus — a lightweight update channel that delivers security patches to running framework instances without requiring redeployment.

When a CVE is discovered in a framework component, a patch is signed with Kairo's private key and published to the bus. Running instances verify the signature, apply the patch to the affected in-memory behavior, and log the patch application — all without restart.

Patches are narrow and surgical. They never modify application code. They modify framework behavior only.

```typescript
// Configure hot-patch behavior
app.sentinel.hotPatch({
  enabled: true,
  channel: 'stable',    // stable | beta | off
  autoApply: true,      // or false to require manual approval
  logPatchDetails: true
})
```

### Memory Pressure Alarms

The Sentinel monitors heap allocation patterns per request. A sudden spike in allocations from a single session — consistent with ReDoS attacks, billion laughs attacks, or memory exhaustion DoS — triggers load shedding for that session before the process is affected. Other sessions are unaffected.

---

## 11. Layer 6 — Developer Experience Layer

Kairo's security should feel like a superpower, not a constraint. The Developer Experience Layer is how Kairo communicates with the developer — not through documentation, not through CI failures, but in the flow of development itself.

### Inline Security Coaching

During development (`NODE_ENV=development`), Kairo prints security coaching messages directly to the dev server output — not as errors, not as warnings, but as suggestions:

```
[kairo] ✦ /search handler: raw SQL with tainted input detected.
  Consider: db.query(sql, [ctx.query.q]) — parameterized queries are auto-secured.
  Docs: kairo.dev/taint-tracking
  This message won't appear in production. Kairo handled it.
```

The app still runs. The vulnerability is neutralized. But the developer is taught, in context, at the moment they wrote the code.

### Audit Mode

A single call activates full audit mode — comprehensive tracing of every security decision Kairo makes:

```typescript
app.audit() // That's it
```

In audit mode, every request produces a structured audit record:
- Entropy score and contributing factors
- Trust Lattice decisions and the relationships that resolved them
- Fields redacted from responses and why
- Taint paths detected and where they were neutralized
- Ghost route hits in the session
- Patch applications from the hot-patch bus

Audit records are written to `./kairo-audit.ndjson` by default.

### Security Budget Dashboard

Running `kairo dashboard` launches a local web UI showing:
- Live attack surface map of all routes and their risk profiles
- Open trust edges in the Intent Graph
- Encryption coverage by model
- Taint paths detected in the last 24 hours
- Entropy score distribution across recent traffic
- Ghost route hit frequency and source geography

### Override Recording

When a developer explicitly disables a security behavior, Kairo records it:

```typescript
app.get('/debug', {
  trust: 'none',
  reason: 'Internal debug endpoint — network-level access control in place',
  handler: async (ctx) => { ... }
})
```

Override records accumulate in the audit log and are surfaced in the dashboard as a "Security Decisions" timeline — a human-readable history of every deliberate security trade-off made in the codebase.

### Scaffolding Born Secure

Files generated by `kairo new` and `kairo generate` are born with security patterns in place:

- Route handlers include intent declarations (empty, ready to fill)
- Model definitions include field-level encryption markers on sensitive field names detected by convention (`password`, `ssn`, `token`, `secret`, `key`, `credit_card`)
- Auth routes include Trust Lattice hooks pre-wired
- Database queries use parameterized form by default

The developer edits the scaffold. They never start from an insecure blank file.

---

## 12. Layer 7 — Hardening Mode

Hardening Mode is dormant under normal conditions. The developer never configures it. It activates automatically when the entropy score of incoming traffic crosses configurable thresholds.

### Elastic Rate Limiting

Rate limits in Kairo are not static numbers. They are curves:

- At entropy 0.0–0.3: No rate limits applied
- At entropy 0.3–0.6: Soft limits — responses slow slightly, no rejection
- At entropy 0.6–0.8: Hard limits — excess requests queued, not dropped
- At entropy 0.8–1.0: Aggressive limits — excess requests deflected to ghost responses

Legitimate users operating at normal entropy levels feel nothing. Attackers operating at high entropy progressively encounter a system that appears to be working but is actually returning plausible fake data.

```typescript
// Optional: customize the entropy-to-limit curve
app.hardening.rateCurve({
  soft: 0.3,
  hard: 0.6,
  aggressive: 0.8
})
```

### Shadow Execution

When a request from a high-entropy session reaches a handler, Kairo can optionally run that handler in a shadow environment — an isolated execution context with a read-only snapshot of the real database state.

The attacker receives a real-looking response from the shadow execution. The real data is untouched.

```typescript
app.hardening.shadowExecution({
  threshold: 0.8,        // entropy score that triggers shadow mode
  routes: ['sensitive']  // 'sensitive' | 'all' | ['/path/one', '/path/two']
})
```

### Stealth Deflection

High-entropy sessions never receive 429, 403, or 401 responses. They receive syntactically valid, semantically plausible responses that tell them nothing useful:

- A failed auth attempt returns a valid token — one that is logged and will produce empty results from every subsequent call
- A scanning probe returns a valid response with subtly wrong data
- An injection attempt returns results that suggest the injection worked — from a ghost dataset

The attacker believes they are succeeding. They are probing a ghost.

### Circuit Breaker Mesh

Service-to-service calls include a behavioral circuit breaker layer that opens not on failure rates but on anomaly patterns — calls happening at unusual intervals, to unusual combinations of services, with unusual parameter shapes. The circuit opens silently, substituting a cached or synthetic response until the anomaly resolves.

---

## 13. The Flexibility Contract

This section documents Kairo's explicit commitment to developer freedom.

### You can disable any layer for any route

```typescript
app.get('/my-route', {
  kairo: {
    membrane: false,   // Disable entropy scoring for this route
    sentinel: false,   // Disable taint tracking for this route
    shield: false,     // Disable data redaction for this route
  },
  reason: 'Legacy integration — external system requires raw response',
  handler: async (ctx) => { ... }
})
```

Kairo does not argue. It records the override and compensates by monitoring the surrounding routes more carefully.

### You can use any database

Kairo's Data Shield works through an adapter interface. Adapters exist for:
- Prisma
- Drizzle ORM
- TypeORM
- Mongoose / MongoDB
- Raw `pg`, `mysql2`, `better-sqlite3`
- Any database with a query builder interface

```typescript
import { drizzleAdapter } from '@kairo/adapter-drizzle'

app.use(drizzleAdapter(db))
```

### You can use any auth system

The Trust Lattice is an authorization layer. It does not dictate authentication. Use Passport, Auth.js, Clerk, Supabase Auth, a custom JWT system, or anything else. Kairo's Trust Lattice receives the authenticated identity from whatever system you use:

```typescript
app.lattice.identity((ctx) => {
  // Return whatever your auth system provides
  return ctx.state.user // passport
  // or: return verifyJwt(ctx.headers.authorization)
  // or: return ctx.session.user
})
```

### You can write raw SQL

Kairo does not ban raw SQL. It wraps it:

```typescript
// This works
const result = await ctx.kairo.db.raw('SELECT * FROM users WHERE id = ?', [userId])
// Kairo's query analysis layer validates the structure before execution
// The developer writes SQL freely
```

### You can return any response shape

Kairo does not enforce response schemas. Contextual redaction operates on field names declared in model definitions. If you return an ad-hoc object, Kairo does not touch it. If you return a model instance, Kairo applies redaction automatically.

### You can run without the MCP

`kairo-mcp` is optional. The framework operates identically without it. The MCP adds Claude Code integration for developer tooling — it does not affect runtime security behavior.

---

## 14. Security Wrapping — How It Works

This section explains the technical mechanism by which Kairo wraps security around developer code without modifying it.

### The Request Context Proxy

Every handler receives a `ctx` object. In Kairo, `ctx` is a Proxy — not a plain object. Property access, assignment, and method calls on `ctx` are intercepted by Kairo's runtime layer.

This means:
- When you read `ctx.body.email`, Kairo records that this tainted value was accessed
- When you call `ctx.db.query(...)`, Kairo intercepts the query for analysis before execution
- When you call `ctx.json(data)`, Kairo applies contextual redaction before the response is written

The developer sees a plain object. Kairo sees every operation.

```typescript
// The developer writes this
app.post('/login', async (ctx) => {
  const user = await ctx.db.users.findOne({ email: ctx.body.email })
  if (!user) return ctx.json({ error: 'not found' }, 404)
  ctx.json({ token: generateToken(user) })
})

// What Kairo does (invisibly):
// 1. ctx.body.email is tagged as tainted
// 2. ctx.db.users.findOne receives a taint-aware query wrapper
// 3. The query is analyzed for injection patterns before execution
// 4. The response is passed through contextual redaction before writing
// 5. The entropy score updates based on timing and behavior
```

### Handler Wrapping

Every route handler is wrapped at registration time in an execution context that:

1. Establishes the taint tracking scope
2. Connects the handler to the Intent Engine contract
3. Installs the canary stack frames
4. Registers the handler in the Intent Graph
5. Binds the Trust Lattice identity resolver

The handler function itself is never modified. The wrapper is applied around it.

### Response Interception

`ctx.json()`, `ctx.send()`, `ctx.html()`, and all other response methods are intercepted before the response is written to the socket. The Data Shield applies redaction. The Sentinel verifies no tainted data is leaking through the response. The entropy score is updated. Then the response is written.

---

## 15. Routing

Kairo's router is built on a radix tree — O(1) lookup performance regardless of route count.

### Basic Routing

```typescript
import { createApp } from 'kairo'

const app = createApp()

app.get('/users', async (ctx) => {
  const users = await ctx.db.users.findMany()
  ctx.json(users)
})

app.post('/users', async (ctx) => {
  const user = await ctx.db.users.create(ctx.body)
  ctx.json(user, 201)
})

app.put('/users/:id', async (ctx) => {
  const user = await ctx.db.users.update(ctx.params.id, ctx.body)
  ctx.json(user)
})

app.delete('/users/:id', async (ctx) => {
  await ctx.db.users.delete(ctx.params.id)
  ctx.status(204)
})

app.listen(3000)
```

### Route Groups

```typescript
const users = app.group('/users')

users.get('/', listUsers)
users.post('/', createUser)
users.get('/:id', getUser)
users.put('/:id', updateUser)
users.delete('/:id', deleteUser)
```

### Route Options

```typescript
app.post('/payments', {
  intent: 'process a payment between two accounts',
  risk: 'high',
  requires: 'owns | memberOf',
  tags: ['financial', 'sensitive'],
  handler: async (ctx) => { ... }
})
```

### Wildcard and Catch-All Routes

```typescript
app.get('/files/*', async (ctx) => {
  const path = ctx.params['*']
  // Path is taint-tracked automatically
  ctx.sendFile(path)
})
```

---

## 16. Middleware

Kairo middleware is an async function that receives `ctx` and a `next` function. Identical to Koa's model — deliberately familiar.

```typescript
// Global middleware
app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  ctx.set('X-Response-Time', `${Date.now() - start}ms`)
})

// Route-scoped middleware
app.get('/admin/*', requireAdmin, async (ctx) => {
  // ...
})

// Group-scoped middleware
const admin = app.group('/admin', { middleware: [requireAdmin] })
```

### Built-in Middleware

```typescript
import { cors, compress, helmet, logger, bodyLimit } from '@kairo/middleware'

app.use(cors({ origins: ['https://myapp.com'] }))
app.use(compress())
app.use(helmet())
app.use(logger())
app.use(bodyLimit('10mb'))
```

`helmet()` in Kairo sets a full suite of security headers automatically. Unlike the npm `helmet` package, it dynamically adjusts CSP directives based on the routes registered in the application — tighter for API routes, broader for routes that serve HTML.

---

## 17. Authentication & Authorization

### Bring Your Own Auth

```typescript
// JWT example
app.lattice.identity(async (ctx) => {
  const token = ctx.headers.authorization?.replace('Bearer ', '')
  if (!token) return null
  return verifyJwt(token, process.env.JWT_SECRET)
})

// Session example
app.lattice.identity((ctx) => ctx.session?.user ?? null)

// Clerk example
app.lattice.identity((ctx) => ctx.auth?.userId ? getClerkUser(ctx.auth.userId) : null)
```

### Defining Relationships

```typescript
app.lattice.define({
  owns: (user, resource) => resource.ownerId === user.id,

  memberOf: async (user, resource) => {
    return db.memberships.exists({
      userId: user.id,
      resourceId: resource.id
    })
  },

  admin: (user) => user.role === 'admin',

  sameOrg: (user, resource) => user.orgId === resource.orgId
})
```

### Protecting Routes

```typescript
// Single relationship
app.get('/documents/:id', {
  requires: 'owns',
  handler: getDocument
})

// Any of multiple relationships
app.get('/documents/:id', {
  requires: 'owns | memberOf | admin',
  handler: getDocument
})

// All relationships required
app.delete('/documents/:id', {
  requires: 'owns & admin',
  handler: deleteDocument
})

// Risk level triggers automatic step-up
app.post('/wire-transfer', {
  requires: 'owns',
  risk: 'critical',
  handler: processTransfer
})
```

### Public Routes

```typescript
app.get('/health', {
  trust: 'none',
  reason: 'Public health check',
  handler: (ctx) => ctx.json({ ok: true })
})
```

---

## 18. Database Layer

### Adapter Setup

```typescript
import { createApp } from 'kairo'
import { prismaAdapter } from '@kairo/adapter-prisma'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const app = createApp()

app.use(prismaAdapter(prisma))
```

### Usage in Handlers

```typescript
app.get('/users/:id', async (ctx) => {
  // ctx.db is your prisma client, wrapped by the Data Shield
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.params.id }
  })
  ctx.json(user) // Contextual redaction applied automatically
})
```

### Model Definitions

```typescript
import { defineModel, field } from '@kairo/data'

export const User = defineModel('user', {
  id: field.uuid(),
  name: field.string(),
  email: field.string().encrypted().visibleTo('owns | admin'),
  passwordHash: field.string().encrypted().never(), // never sent in responses
  role: field.string(),
  createdAt: field.timestamp()
})
```

---

## 19. Validation

Kairo uses a Zod-compatible validation API. Any Zod schema works directly.

```typescript
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8)
})

app.post('/users', {
  body: CreateUserSchema,
  handler: async (ctx) => {
    // ctx.body is typed and validated
    // Invalid requests receive a 400 with structured errors automatically
    const user = await ctx.db.user.create(ctx.body)
    ctx.json(user, 201)
  }
})
```

### Validation and Taint Tracking

Validated fields retain their taint markers through the validation transform. A validated email is still tainted — it came from user input. Kairo tracks this correctly through Zod transforms.

---

## 20. Error Handling

```typescript
// Global error handler
app.onError((error, ctx) => {
  // Kairo scrubs sensitive information from error responses automatically
  // Stack traces never reach the client in production
  ctx.json({ error: error.message }, 500)
})

// Not found handler
app.onNotFound((ctx) => {
  // Note: Kairo's ghost route layer runs before this
  // Requests that hit ghost routes never reach onNotFound
  ctx.json({ error: 'Not found' }, 404)
})
```

### Error Scrubbing

In production, Kairo automatically scrubs error responses of:
- Stack traces
- File paths
- Database query strings
- Internal service names
- Environment variable names

The developer can return any error. Kairo shapes what the client actually sees.

---

## 21. File Uploads

```typescript
app.post('/upload', async (ctx) => {
  const file = ctx.file('avatar')

  // Kairo has already, before this handler runs:
  // - Validated the MIME type against magic bytes (not just the Content-Type header)
  // - Computed the entropy of the file to detect polyglot files
  // - Checked file size against configured limits
  // - Scanned for known malicious signatures if mcp-scan is connected

  await storage.save(file.name, file.stream)
  ctx.json({ url: `/files/${file.name}` })
})
```

### Upload Configuration

```typescript
app.uploads({
  maxSize: '10mb',
  allowed: ['image/jpeg', 'image/png', 'application/pdf'],
  magicBytesCheck: true,   // validate MIME type from file content, not header
  entropyCheck: true,       // flag files with suspiciously high entropy
  destination: './uploads'
})
```

---

## 22. WebSockets

```typescript
app.ws('/chat/:roomId', {
  intent: 'real-time chat messaging in a room',
  requires: 'memberOf',

  onConnect: async (socket, ctx) => {
    // Taint tracking applies to WebSocket messages too
    await rooms.join(ctx.params.roomId, ctx.user.id)
  },

  onMessage: async (socket, message, ctx) => {
    // message.data is taint-tracked
    await rooms.broadcast(ctx.params.roomId, message.data)
  },

  onClose: async (socket, ctx) => {
    await rooms.leave(ctx.params.roomId, ctx.user.id)
  }
})
```

WebSocket connections are tracked in the Intent Graph. Message patterns that deviate from the declared intent trigger behavioral alerts.

---

## 23. Rate Limiting

Rate limiting in Kairo is automatic via Hardening Mode. Manual configuration is available for specific routes:

```typescript
app.get('/api/search', {
  rateLimit: {
    window: '1m',
    max: 30,
    key: (ctx) => ctx.user?.id ?? ctx.ip // rate limit per user, fallback to IP
  },
  handler: searchHandler
})
```

The manual rate limit and the entropy-based elastic rate limit work together. The stricter limit wins.

---

## 24. Logging & Observability

```typescript
// Configure logging
app.logging({
  level: 'info',
  format: 'json',    // json | pretty
  output: 'stdout',  // stdout | file | both
  redact: ['password', 'token', 'secret', 'authorization'] // auto-redacted from logs
})
```

### Security Events

All security events are written to a separate security event stream:

```typescript
app.security.onEvent((event) => {
  // event.type: 'ghost_route_hit' | 'taint_neutralized' | 'entropy_spike' |
  //             'intent_drift' | 'poison_pill_triggered' | 'lattice_denied' |
  //             'shadow_execution' | 'patch_applied' | ...
  console.log(event)
  // or forward to your SIEM, Datadog, Grafana Loki, etc.
})
```

### OpenTelemetry

```typescript
import { otelPlugin } from '@kairo/otel'

app.use(otelPlugin({
  serviceName: 'my-api',
  endpoint: 'http://jaeger:4318'
}))
```

---

## 25. Environment & Secrets

```typescript
// kairo.config.ts
import { defineConfig } from 'kairo'

export default defineConfig({
  secrets: {
    // Secrets are type-checked, validated at startup, and never logged
    DATABASE_URL: secret.string().url(),
    JWT_SECRET: secret.string().minLength(32),
    ENCRYPTION_KEY: secret.string().hex().length(64),
    STRIPE_SECRET_KEY: secret.string().startsWith('sk_'),
  }
})
```

If a required secret is missing at startup, Kairo refuses to start — with a clear, actionable error message. Secrets are never interpolated into log output. Taint tracking marks secret values as high-sensitivity — they are blocked from appearing in any response.

---

## 26. Testing

```typescript
import { createTestApp } from '@kairo/test'
import { app } from './app'

const test = createTestApp(app)

// Basic request testing
const response = await test.get('/users/123').withUser({ id: '123', role: 'user' })
expect(response.status).toBe(200)

// Security testing
const taintTest = await test.post('/search').body({ q: "' OR 1=1--" })
expect(taintTest.security.taintNeutralized).toBe(true)
expect(taintTest.status).not.toBe(500)

// Entropy testing
const highEntropyTest = await test.get('/api/data').withEntropy(0.9)
expect(highEntropyTest.security.hardeningActive).toBe(true)

// Lattice testing
const unauthorized = await test.delete('/documents/123').withUser({ id: '456' })
expect(unauthorized.status).toBe(403)

// Ghost route testing
const ghostHit = await test.get('/.env')
expect(ghostHit.security.ghostRouteTriggered).toBe(true)
```

---

## 27. CLI — kairo

```
kairo new <project-name>      Create a new Kairo project
kairo generate route <name>   Generate a secure route scaffold
kairo generate model <name>   Generate a model with field security declarations
kairo audit                   Run a security audit on the current project
kairo dashboard               Launch the security budget dashboard
kairo fuzz                    Run the built-in fuzzer against local routes
kairo surface                 Print the current attack surface map
kairo patch list              List available hot patches
kairo patch apply             Apply pending hot patches
kairo export policy           Export security policy document from codebase
```

### kairo new

```
kairo new my-api

  ✦ Kairo v1.0.0
  Creating my-api...

  ✓ Project scaffolded
  ✓ TypeScript configured (strict mode)
  ✓ Security baseline established
  ✓ Field encryption keys generated
  ✓ Ghost routes seeded
  ✓ MCP server configured

  Next: cd my-api && npm install && kairo dev
```

---

## 28. MCP Suite — kairo-mcp

`@kairo/mcp` implements the Model Context Protocol over stdio and SSE. When connected to Claude Code (or any MCP-compatible AI coding tool), it exposes Kairo's security telemetry as tool calls the AI can invoke while writing application code.

### Tools Exposed

**`kairo_surface`**
Returns the current attack surface map — all routes, their risk profiles, intent declarations, trust lattice requirements, and encryption coverage.

**`kairo_audit`**
Returns recent security events — taint neutralizations, ghost route hits, entropy spikes, intent drift detections, lattice denials.

**`kairo_fuzz`**
Runs the built-in fuzzer against specified routes and returns a structured report of findings.

**`kairo_explain`**
Given a route path or handler name, explains every security decision Kairo is making for it — what layers are active, what they are doing, and why.

**`kairo_policy`**
Generates a human-readable security policy document derived from the codebase — suitable for compliance documentation.

**`kairo_patch`**
Lists available hot patches, their CVE references, and applies them.

**`kairo_override`**
Records a security override with a reason — used when Claude Code or the developer needs to bypass a security layer for a specific route.

**`kairo_mutate`**
Reports behavioral changes between the current deploy and the previous one — routes whose behavior has changed in ways that differ from their declared intent.

### Connecting kairo-mcp

```json
// .mcp/config.json (Claude Code)
{
  "servers": {
    "kairo": {
      "command": "npx",
      "args": ["@kairo/mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Once connected, Claude Code can see the project's security state, understand what Kairo is doing for each route, and make informed decisions without the developer having to explain the security context manually.

---

## 29. Plugin System

```typescript
import { definePlugin } from 'kairo'

export const myPlugin = definePlugin({
  name: 'my-plugin',
  version: '1.0.0',

  // Hook into the request lifecycle
  onRequest: async (ctx, next) => {
    await next()
  },

  // Hook into security events
  onSecurityEvent: async (event) => {
    await forwardToSIEM(event)
  },

  // Add new Trust Lattice relationships
  latticeRelationships: {
    isPremium: (user) => user.plan === 'premium'
  },

  // Add new route options
  routeOptions: {
    billing: z.object({
      plan: z.enum(['free', 'pro', 'enterprise'])
    })
  }
})

// Register
app.use(myPlugin)
```

Plugins can extend any part of Kairo without modifying the core. They are tree-shaken when unused.

---

## 30. Performance

Kairo is built on uWebSockets.js — the fastest HTTP server in the Node.js ecosystem. The security layers add overhead measured in microseconds on the critical path.

### Benchmarks (preliminary, local development hardware)

| | Requests/sec | Latency p99 |
|---|---|---|
| Express (no security) | ~18,000 | 4.2ms |
| Fastify (no security) | ~35,000 | 2.1ms |
| **Kairo (all layers active)** | **~31,000** | **2.4ms** |
| Kairo (membrane only) | ~38,000 | 1.9ms |

Security layers that run asynchronously (Intent Graph checks, behavioral biometric updates) are fire-and-forget on the hot path — they do not add to response latency.

### Tree-Shaking

Every Kairo layer is independently tree-shakeable. A deployment that does not use WebSockets does not include the WebSocket security layer. A deployment that does not use the ZKP auth layer does not include snarkjs.

The minimum Kairo bundle (HTTP routing + Request Membrane + Runtime Sentinel) is approximately 45KB.

---

## 31. Deployment

### Docker

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

# Kairo generates a security manifest at build time
COPY --from=build /app/kairo.manifest.json .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Environment Variables

```env
NODE_ENV=production
KAIRO_ENCRYPTION_KEY=<64-char hex>
KAIRO_PATCH_CHANNEL=stable
KAIRO_AUDIT_OUTPUT=stdout
KAIRO_GHOST_ROUTES=true
KAIRO_SHADOW_EXECUTION=true
```

### Health Checks

```typescript
app.get('/health', {
  trust: 'none',
  reason: 'Load balancer health check',
  handler: (ctx) => ctx.json({
    status: 'ok',
    kairo: app.kairo.health() // returns layer status, patch level, entropy baseline
  })
})
```

---

## 32. Roadmap

### v1.0 — Foundation
- Request Membrane (entropy scoring, ghost routes, signed envelopes)
- Runtime Sentinel (taint tracking, canary frames)
- Trust Lattice (relationship-graph auth, temporal tokens)
- Data Shield (field encryption, contextual redaction, poison pills)
- Developer Experience Layer (coaching, audit mode, override recording)
- `@kairo/cli` with `new`, `generate`, `audit`
- Adapters: Prisma, Drizzle, raw pg/mysql2
- `@kairo/mcp` with surface, audit, explain tools

### v1.1 — Intelligence
- Intent Engine (intent declarations, behavioral contract validation)
- Intent Graph (zero-trust service mesh)
- Semantic Route Guards
- Behavioral biometrics (browser client SDK)
- `kairo dashboard` UI
- Hot-patch bus v1

### v1.2 — Hardening
- Hardening Mode (elastic rate limiting, shadow execution, stealth deflection)
- Circuit breaker mesh
- Differential privacy on aggregates
- `kairo fuzz` and `kairo surface` CLI commands

### v2.0 — Ecosystem
- Mutation drift detection between deploys
- Zero-knowledge proof auth (optional)
- `@kairo/mcp` full tool suite
- OpenTelemetry native integration
- Security policy export for compliance (SOC2, ISO 27001 mapping)
- Edge runtime support (Cloudflare Workers, Deno Deploy)

---

## 33. Contributing

Kairo is designed to be contributed to. The architecture is intentionally layered so contributors can work on one layer without understanding all others.

### Setup

```bash
git clone https://github.com/kairo-framework/kairo
cd kairo
npm install
npm run dev
```

### Layer Ownership

Each layer lives in its own package under `packages/`:

```
packages/
  membrane/       Request Membrane
  intent/         Intent Engine
  lattice/        Trust Lattice
  shield/         Data Shield
  sentinel/       Runtime Sentinel
  dx/             Developer Experience Layer
  hardening/      Hardening Mode
  cli/            CLI
  mcp/            MCP Suite
  test/           Test utilities
  adapters/       Database adapters
```

### Contribution Principles

1. **Never add developer friction.** If a feature requires the developer to change how they write code, it must provide a migration path and a default that requires no change.
2. **Security must form around code, not the reverse.** New security features must work without configuration.
3. **Every layer must be independently tree-shakeable.** Do not create cross-layer hard dependencies.
4. **Overrides must always be possible.** Any security behavior must be bypassable with a reason string.

---

## 34. Glossary

**Canary Stack Frame** — A synthetic frame inserted into the JavaScript call stack by the Runtime Sentinel to detect stack tampering, prototype pollution, and eval injection.

**Contextual Redaction** — The automatic removal of response fields based on the Trust Lattice identity of the caller, applied transparently to all model-typed responses.

**Entropy Score** — A float (0.0–1.0) assigned to each request based on behavioral, structural, and temporal anomaly indicators. Flows through all layers and drives adaptive hardening.

**Ghost Route** — A fake route generated by the Request Membrane that returns plausible responses to scanners while silently flagging the requesting session.

**Hardening Mode** — The framework's adaptive defense state, which activates automatically when entropy thresholds are crossed and relaxes when traffic normalizes.

**Hot-Patch Bus** — A signed update channel that delivers security patches to running Kairo instances without requiring redeployment.

**Intent Declaration** — A DSL string attached to a route handler that declares the route's purpose. Validated at runtime by the Intent Engine against observed handler behavior.

**Intent Graph** — A directed graph of declared service-to-service call relationships. Calls outside the graph trigger alerts in production.

**Kairo** — From Greek *kairos*: the perfect decisive moment. The instant when conditions align and the right action must happen.

**Poison Pill Record** — A synthetic database record seeded by the Data Shield that triggers exfiltration alerts when accessed by bulk queries.

**Request Membrane** — Layer 1 of Kairo's architecture. The living adaptive boundary through which every request passes before any application code runs.

**Runtime Sentinel** — Layer 5 of Kairo's architecture. The active watchdog that tracks taint through execution, monitors memory pressure, and manages the hot-patch bus.

**Shadow Execution** — The routing of high-entropy requests to an isolated execution context with a read-only snapshot of real data. The attacker receives a real-looking response. Real data is untouched.

**Stealth Deflection** — The practice of returning plausible fake responses to high-entropy sessions instead of error codes, preventing attackers from learning the shape of the defense.

**Taint Tracking** — The propagation of a taint marker from user-input sources through every function call to dangerous sinks, where unescaped taint is neutralized before execution.

**Temporal Token** — An authentication token whose effective validity decays based on the risk level of actions performed, rather than a fixed expiry time.

**Trust Lattice** — Layer 3 of Kairo's architecture. A relationship-graph-based authorization system that evaluates access based on entity relationships rather than static role assignments.

---

*Kairo. Act at the right moment. Secure from the first line.*

---

> This document is the single source of truth for the Kairo framework.
> Version: 0.1.0-design
> Status: Pre-implementation specification
> Last updated: 2026
