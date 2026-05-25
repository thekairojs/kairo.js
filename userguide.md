# KAIRO User Guide

KAIRO is a security-substrate web framework for Node.js. Every request passes through a scoring pipeline before it reaches your code — suspicious traffic is flagged, high-entropy requests are blocked, and outbound responses are scanned for leaked data.

---

## Table of Contents

1. [Installation](#installation)
2. [Your First Server](#your-first-server)
3. [Core Concepts](#core-concepts)
4. [Request Membrane](#request-membrane)
5. [Trust Lattice](#trust-lattice)
6. [Input Validation](#input-validation)
7. [Hardening](#hardening)
8. [Data Shield](#data-shield)
9. [Runtime Sentinel](#runtime-sentinel)
10. [Security Events](#security-events)
11. [Ghost Routes](#ghost-routes)
12. [Dev Logger](#dev-logger)
13. [Full Example](#full-example)

---

## Installation

Install the core package plus whichever layers you need:

```bash
npm install @thekairojs/kairo

# Security layers (add as needed)
npm install @thekairojs/kairo-membrane
npm install @thekairojs/kairo-lattice
npm install @thekairojs/kairo-hardening
npm install @thekairojs/kairo-shield
npm install @thekairojs/kairo-sentinel
npm install @thekairojs/kairo-dx
```

---

## Your First Server

```ts
import { createApp } from '@thekairojs/kairo'

const app = createApp()

app.get('/hello', (ctx) => {
  ctx.json({ hello: 'world' })
})

await app.listen(3000)
```

Every route handler receives a `ctx` object. The most-used methods:

```ts
ctx.json(data, status?)    // send a JSON response
ctx.body                   // parsed request body
ctx.query                  // parsed query string as Record<string, string>
ctx.params                 // route params — e.g. /users/:id → ctx.params.id
ctx.headers                // request headers
ctx.ip                     // client IP address
ctx.kairo                  // security context (entropy, events, lattice)
```

---

## Core Concepts

### Middleware

Middleware runs before your handlers. Call `next()` to continue the chain:

```ts
app.use(async (ctx, next) => {
  console.log(ctx.method, ctx.path)
  await next()
})
```

### Route groups

```ts
const api = app.group('/api')

api.get('/users', listUsers)
api.post('/users', createUser)
api.get('/users/:id', getUser)
```

### HTTP methods

`app.get`, `app.post`, `app.put`, `app.patch`, `app.delete` — all accept `(path, ...middleware, handler)`.

### Security context

Every request has `ctx.kairo` which holds:

| Property | Type | Description |
|---|---|---|
| `entropy` | `number` [0–1] | How suspicious this request looks |
| `taintedPaths` | `Set<string>` | Input fields that haven't been validated yet |
| `events` | `SecurityEvent[]` | Security events emitted during this request |
| `hardeningActive` | `boolean` | Whether hardening triggered |
| `lattice` | object | Resolved trust level and roles |

---

## Request Membrane

The membrane scores every incoming request and writes a number from `0.0` (clean) to `1.0` (hostile) to `ctx.kairo.entropy`. Place it first in your middleware chain.

```ts
import { createMembrane } from '@thekairojs/kairo-membrane'

app.use(createMembrane())
```

Scoring factors:

| Factor | Weight | What triggers it |
|---|---|---|
| Header anomalies | 30% | Scanner user-agents, missing UA, injection characters |
| IP behavior | 35% | High request rate, hitting many distinct paths, ghost route hits |
| Payload | 20% | Body size spikes, suspicious content types |
| Timing | 15% | Request rate relative to rolling baseline |

### Reading entropy in a handler

```ts
app.get('/status', (ctx) => {
  ctx.json({ entropy: ctx.kairo.entropy })
})
```

### Taint tracking

Fields from untrusted sources (query, body, params) are marked in `ctx.kairo.taintedPaths`. The `validate()` middleware clears them when fields pass schema checks.

```ts
app.get('/search', (ctx) => {
  // ctx.kairo.taintedPaths includes 'query.q' until validated
  const q = ctx.query.q
})
```

### HMAC request signing

For service-to-service calls where you want cryptographic authenticity:

```ts
import { sign, verifySignature } from '@thekairojs/kairo-membrane'

// Signing (sender side)
const body = 'payload'
const sig = sign(body, process.env.SHARED_SECRET!)

// Verification (receiver side, as middleware)
app.use(verifySignature({
  secret: process.env.SHARED_SECRET!,
  required: true,   // false = flag but don't block
}))
```

Invalid signatures elevate entropy. With `required: true`, missing or invalid signatures return `401` immediately.

### Membrane options

```ts
createMembrane({
  trustProxy:           false,  // trust X-Forwarded-For for IP resolution
  exposeDetail:         false,  // write component breakdown to ctx.state
  entropyEventThreshold: 0.5,   // emit entropy_spike event above this value
})
```

---

## Trust Lattice

The lattice enforces claim-based authorization. Define a `resolve` function that returns a trust level and roles for each request, then protect routes with `lattice.require()`.

```ts
import { createLattice } from '@thekairojs/kairo-lattice'
import type { TrustLevel } from '@thekairojs/kairo-lattice'

const lattice = createLattice({
  resolve: async (ctx) => {
    const token = ctx.headers['authorization']?.replace('Bearer ', '')
    if (!token) return { level: 'none' as TrustLevel, roles: [] }

    const user = await verifyToken(token)
    return {
      level:   user.isAdmin ? 'high' : 'low' as TrustLevel,
      roles:   user.roles,
      subject: user.id,
    }
  },
})

app.use(lattice)
```

### Protecting routes

```ts
// Require minimum trust level
app.get('/account', lattice.require({ level: 'low' }), getAccount)

// Require a specific role
app.delete('/users/:id', lattice.require({ roles: ['admin'] }), deleteUser)

// Require all listed roles
app.post('/deploy', lattice.require({ roles: ['admin', 'ops'], all: true }), deploy)
```

### Trust levels

`none < low < medium < high`

Requiring `medium` passes both `medium` and `high`. Denials emit a `lattice_denied` event and add `+0.4` to entropy.

### Checking trust in a handler

```ts
app.get('/me', (ctx) => {
  const { level, roles, subject } = ctx.kairo.lattice
  ctx.json({ level, roles, subject })
})
```

---

## Input Validation

The `validate()` middleware checks `body`, `query`, and `params` against a schema and returns `422` with a detailed error list on failure. It also clears validated fields from `taintedPaths`.

```ts
import { validate } from '@thekairojs/kairo-dx'

app.post('/users', validate({
  body: {
    name:  { type: 'string',  required: true, max: 100 },
    email: { type: 'string',  required: true, pattern: /^[^@]+@[^@]+$/ },
    age:   { type: 'number',  min: 0, max: 150 },
    role:  { type: 'string',  enum: ['admin', 'user', 'guest'] },
    active: { type: 'boolean' },
  },
  query: {
    page: { type: 'number', min: 1 },
  },
}), createUser)
```

Validation failures return:

```json
{
  "error": "Validation failed",
  "errors": [
    { "field": "body.email", "message": "required" },
    { "field": "body.age",   "message": "must be ≤ 150" }
  ]
}
```

### Type coercion for query params

Query string values are always strings. KAIRO coerces them automatically:

- `?page=3` with `type: 'number'` → coerced to `3` before min/max checks
- `?dry=true` with `type: 'boolean'` → coerced to `true`
- `?dry=yes` with `type: 'boolean'` → fails (only `"true"` / `"false"` accepted)

### Nested objects

```ts
validate({
  body: {
    address: {
      type: 'object',
      properties: {
        street: { type: 'string', required: true },
        zip:    { type: 'string', pattern: /^\d{5}$/ },
      },
    },
  },
})
// Error paths like "body.address.zip" are reported in full
```

### Arrays

```ts
validate({
  body: {
    tags: { type: 'array', items: { type: 'string' } },
  },
})
// Error paths like "body.tags[1]" are reported per element
```

---

## Hardening

The hardening layer blocks or logs requests whose entropy meets or exceeds a threshold. Place it after the membrane.

```ts
import { createHardening } from '@thekairojs/kairo-hardening'

app.use(createMembrane())
app.use(createHardening({ threshold: 0.75 }))
```

High-entropy requests receive `429 Too Many Requests` by default. The response body intentionally omits the entropy score to avoid fingerprinting.

### Options

```ts
createHardening({
  threshold: 0.75,         // [0–1], default 0.75
  action:    'block',      // 'block' (default) or 'log'
  status:    429,          // default 429
  message:   'Request rejected',
  onExceed:  async (ctx, entropy) => {
    // called on every exceed, regardless of action
    await notify(`entropy spike ${entropy.toFixed(2)} on ${ctx.path}`)
  },
})
```

Use `action: 'log'` during rollout to observe what would be blocked without breaking traffic.

---

## Data Shield

The shield intercepts outbound JSON responses and scans them for PII and sensitive strings before they leave the process.

```ts
import { createShield } from '@thekairojs/kairo-shield'

app.use(createShield({ pii: true }))
```

Detected patterns include: email addresses, credit card numbers, SSNs, US phone numbers, JWTs, AWS access keys, and private IP ranges.

### Redaction

```ts
createShield({
  pii:    true,
  redact: true,   // replace matched fields with "[REDACTED]"
})
```

### Custom sensitive strings

```ts
createShield({
  pii:              true,
  sensitiveStrings: ['sk_live_', 'ghp_', 'PRIVATE_KEY'],
  onPii: (ctx, matches) => {
    console.error('PII leak blocked:', matches.map(m => m.type))
  },
})
```

Detections emit a `taint_neutralized` security event. Only the first 4 characters of any match are stored — the full value is never logged.

---

## Runtime Sentinel

The sentinel adds a second pass of anomaly detection focused on runtime behavior: header manipulation, path traversal, payload size anomalies.

```ts
import { createSentinel } from '@thekairojs/kairo-sentinel'

app.use(createSentinel())
```

### Canary records

Canaries detect data exfiltration. Inject a canary token when writing sensitive rows to your database. If that token ever appears in an API response, a leak path exists.

```ts
import { createCanary, scanForCanary } from '@thekairojs/kairo-sentinel'

// When writing a row
const row = {
  id:      userId,
  email:   user.email,
  _canary: createCanary(`user:${userId}`),
}
await db.insert(row)

// In a response handler or custom shield callback
const leak = scanForCanary(JSON.stringify(responseBody))
if (leak) {
  // the canary label tells you which row leaked
  console.error('Canary leak:', leak.label)
}
```

Canary tokens are 16-byte hex strings stored in a process-level registry. The scanner is safe against circular references.

---

## Security Events

All layers emit structured events to `ctx.kairo.events`. You can listen globally with `app.onSecurityEvent`.

```ts
app.onSecurityEvent((event) => {
  // fires for every security event across all requests
  console.log(event.type, event.entropy, event.ip)
})
```

### Event types

| Type | Emitted by | Meaning |
|---|---|---|
| `entropy_spike` | membrane, hardening, sentinel | Request entropy exceeded threshold |
| `taint_neutralized` | validate, shield | Tainted input validated or PII blocked |
| `lattice_denied` | lattice | Authorization check failed |
| `intent_drift` | intent | Request pattern diverged from declared intent |
| `ghost_route_hit` | core | Request hit a decoy route |

### Event shape

```ts
interface SecurityEvent {
  type:      string
  entropy:   number      // ctx.kairo.entropy at time of event
  ip:        string
  timestamp: number      // Date.now()
  route?:    string
  detail?:   string
}
```

---

## Ghost Routes

Ghost routes are decoy endpoints. Any request to them is logged as highly suspicious — real users never hit paths like `/.env` or `/admin/config.php`.

```ts
app.ghost('/.env')
app.ghost('/wp-admin')
app.ghost('/admin/backdoor', { alertLevel: 'high' })
```

Ghost hits emit a `ghost_route_hit` event and significantly elevate the IP's entropy score for subsequent requests.

---

## Dev Logger

The dev logger prints per-request security diagnostics to stdout. It reads nothing from the network — it only observes `ctx` after `next()` completes.

```ts
import { devLogger } from '@thekairojs/kairo-dx'

app.use(devLogger())
```

Sample output:

```
[kairo] POST /api/users — 201 — 6ms
  entropy: 0.080
  events:  none
  tainted: (none)
  lattice: low / u-42 / [user]
```

Disable in production:

```ts
app.use(devLogger({ enabled: process.env.NODE_ENV !== 'production' }))
```

With `exposeDetail: true` on the membrane, the logger also shows the entropy component breakdown and active signals.

---

## Full Example

A production-style server with all layers enabled:

```ts
import { createApp } from '@thekairojs/kairo'
import { createMembrane, verifySignature } from '@thekairojs/kairo-membrane'
import { createLattice } from '@thekairojs/kairo-lattice'
import { createHardening } from '@thekairojs/kairo-hardening'
import { createShield } from '@thekairojs/kairo-shield'
import { createSentinel } from '@thekairojs/kairo-sentinel'
import { validate, devLogger } from '@thekairojs/kairo-dx'
import type { TrustLevel } from '@thekairojs/kairo-lattice'

const app = createApp({ trustProxy: true })

// ── Security pipeline ────────────────────────────────────────────────────────

app.use(createMembrane({ exposeDetail: process.env.NODE_ENV !== 'production' }))
app.use(createSentinel())
app.use(createHardening({ threshold: 0.80 }))
app.use(createShield({ pii: true, redact: true }))

// ── Auth ─────────────────────────────────────────────────────────────────────

const lattice = createLattice({
  resolve: async (ctx) => {
    const token = ctx.headers['authorization']?.replace('Bearer ', '')
    if (!token) return { level: 'none' as TrustLevel, roles: [] }
    const user = await verifyToken(token)
    return { level: user.isAdmin ? 'high' : 'low' as TrustLevel, roles: user.roles, subject: user.id }
  },
})
app.use(lattice)

// ── Dev diagnostics ───────────────────────────────────────────────────────────

app.use(devLogger({ enabled: process.env.NODE_ENV !== 'production' }))

// ── Global security event hook ────────────────────────────────────────────────

app.onSecurityEvent((event) => {
  if (event.entropy > 0.85) {
    console.warn(`[security] ${event.type} | ip=${event.ip} | entropy=${event.entropy.toFixed(2)}`)
  }
})

// ── Ghost routes ──────────────────────────────────────────────────────────────

app.ghost('/.env')
app.ghost('/wp-login.php')
app.ghost('/admin/config.php')

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (ctx) => ctx.json({ ok: true }))

app.get('/me', lattice.require({ level: 'low' }), (ctx) => {
  ctx.json({ subject: ctx.kairo.lattice.subject })
})

app.post('/users', lattice.require({ level: 'high' }), validate({
  body: {
    name:  { type: 'string', required: true, max: 100 },
    email: { type: 'string', required: true, pattern: /^[^@]+@[^@]+$/ },
    role:  { type: 'string', enum: ['admin', 'user', 'guest'] },
  },
}), async (ctx) => {
  const { name, email, role } = ctx.body as { name: string; email: string; role: string }
  const user = await db.createUser({ name, email, role })
  ctx.json(user, 201)
})

// ── Internal service endpoint with HMAC ───────────────────────────────────────

app.use('/internal', verifySignature({ secret: process.env.SERVICE_SECRET!, required: true }))

app.post('/internal/jobs', (ctx) => {
  ctx.json({ queued: true })
})

// ── Start ─────────────────────────────────────────────────────────────────────

await app.listen(3000)
console.log('Listening on :3000')
```

---

## Recommended Middleware Order

The order matters. This sequence gives each layer the information it needs:

```
createMembrane()       — scores the request first
createSentinel()       — anomaly detection informed by membrane score
createHardening()      — blocks high-entropy requests early
createShield()         — wraps response scanning around everything below
lattice                — resolve trust after blocking obvious bots
devLogger()            — last, so it sees the final ctx state
```

Your route-level `validate()` calls sit inside individual route definitions, not in the global chain.
