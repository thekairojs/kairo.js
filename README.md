# KAIRO

A security-substrate web framework for Node.js. Every request is scored, tracked, and guarded before it reaches your code.

```
Request → Membrane → Trust Lattice → Your Code → Data Shield → Sentinel → Response
```

Most frameworks bolt security on after the fact. KAIRO builds it into the request lifecycle — entropy scoring, taint tracking, claim-based auth, output scanning, and anomaly detection run as first-class middleware, not afterthoughts.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| `@thekairojs/kairo` | [![npm](https://img.shields.io/npm/v/@thekairojs/kairo)](https://www.npmjs.com/package/@thekairojs/kairo) | Core — app, router, context, middleware |
| `@thekairojs/kairo-membrane` | [![npm](https://img.shields.io/npm/v/@thekairojs/kairo-membrane)](https://www.npmjs.com/package/@thekairojs/kairo-membrane) | Entropy scoring, taint tracking, HMAC signing |
| `@thekairojs/kairo-lattice` | [![npm](https://img.shields.io/npm/v/@thekairojs/kairo-lattice)](https://www.npmjs.com/package/@thekairojs/kairo-lattice) | Claim-based auth with ordered trust levels |
| `@thekairojs/kairo-hardening` | [![npm](https://img.shields.io/npm/v/@thekairojs/kairo-hardening)](https://www.npmjs.com/package/@thekairojs/kairo-hardening) | Block high-entropy requests automatically |
| `@thekairojs/kairo-shield` | [![npm](https://img.shields.io/npm/v/@thekairojs/kairo-shield)](https://www.npmjs.com/package/@thekairojs/kairo-shield) | Outbound PII detection and redaction |
| `@thekairojs/kairo-sentinel` | [![npm](https://img.shields.io/npm/v/@thekairojs/kairo-sentinel)](https://www.npmjs.com/package/@thekairojs/kairo-sentinel) | Runtime anomaly detection, canary records |
| `@thekairojs/kairo-dx` | [![npm](https://img.shields.io/npm/v/@thekairojs/kairo-dx)](https://www.npmjs.com/package/@thekairojs/kairo-dx) | Schema validation middleware + dev logger |
| `@thekairojs/kairo-cli` | [![npm](https://img.shields.io/npm/v/@thekairojs/kairo-cli)](https://www.npmjs.com/package/@thekairojs/kairo-cli) | Scaffold, route inspection, security audit |

## Quick start

```bash
npm install @thekairojs/kairo @thekairojs/kairo-membrane @thekairojs/kairo-lattice @thekairojs/kairo-hardening
```

```ts
import { createApp } from '@thekairojs/kairo'
import { createMembrane } from '@thekairojs/kairo-membrane'
import { createLattice } from '@thekairojs/kairo-lattice'
import { createHardening } from '@thekairojs/kairo-hardening'

const app = createApp()

const lattice = createLattice({
  resolve: async (ctx) => ({
    level:   ctx.headers['x-trust'] ?? 'none',
    roles:   [],
    subject: ctx.headers['x-user-id'],
  }),
})

app.use(createMembrane())
app.use(createHardening({ threshold: 0.75 }))
app.use(lattice)

app.get('/public', (ctx) => {
  ctx.json({ ok: true })
})

app.get('/admin', lattice.require({ level: 'high' }), (ctx) => {
  ctx.json({ ok: true })
})

await app.listen(3000)
```

## How it works

Every request gets an **entropy score** between `0.0` (clean) and `1.0` (hostile), computed from:

- Header anomalies — scanner user-agents, missing fields, injection characters
- IP behavior — request rate, path diversity, ghost route hits
- Payload signals — body size spikes, suspicious content types
- Timing — inter-request cadence relative to rolling baseline

That score flows through `ctx.kairo.entropy` and every layer can read or react to it. The hardening layer blocks anything at or above your threshold before it reaches your handlers.

## CLI

```bash
npx @thekairojs/kairo-cli new my-app    # scaffold a new project
npx @thekairojs/kairo-cli routes        # list all registered routes
npx @thekairojs/kairo-cli audit         # scan for security anti-patterns
```

## Architecture

Seven layers, each with a distinct role:

| Layer | Package | Role |
|-------|---------|------|
| Request Membrane | `kairo-membrane` | Score and taint-track every request |
| Intent Engine | `kairo-intent` | Classify request patterns |
| Trust Lattice | `kairo-lattice` | Claim-based auth: none < low < medium < high |
| Developer Code | — | Your handlers, after all guards pass |
| Data Shield | `kairo-shield` | Scan outbound responses for PII |
| Runtime Sentinel | `kairo-sentinel` | Anomaly detection, canary leak detection |
| DX / Hardening | `kairo-dx`, `kairo-hardening` | Validation, diagnostics, active blocking |

## Documentation

See [userguide.md](./userguide.md) for a full walkthrough of every layer with code examples.

## License

MIT
