# KAIRO

A security-substrate web framework for Node.js. Every request is scored, tracked, and guarded before it reaches your code.

```
Request → Membrane → Trust Lattice → Your handlers → Data Shield → Sentinel → Response
```

## Packages

| Package | Description |
|---------|-------------|
| `kairo` | Core framework — app, router, context, middleware |
| `kairo-membrane` | Entropy scoring, taint tracking, HMAC signing |
| `kairo-lattice` | Trust lattice — claim-based auth with level ordering |
| `kairo-sentinel` | Runtime anomaly detection, canary records |
| `kairo-hardening` | Active entropy-based request blocking |
| `kairo-dx` | Schema validation middleware + dev logger |
| `kairo-cli` | CLI — scaffold, route inspection, security audit |

## Quick start

```bash
npm install kairo kairo-membrane kairo-lattice
```

```ts
import { createApp } from 'kairo'
import { createMembrane } from 'kairo-membrane'
import { createLattice } from 'kairo-lattice'
import { createHardening } from 'kairo-hardening'

const app = createApp()
const lattice = createLattice({ resolve: async (ctx) => ({ level: 'low', roles: [], subject: ctx.headers['x-user-id'] as string }) })

app.use(createMembrane())
app.use(createHardening({ threshold: 0.75 }))
app.use(lattice.resolveMiddleware)

app.get('/admin', lattice.require({ level: 'high' }), (ctx) => {
  ctx.json({ ok: true })
})

await app.listen(3000)
```

## CLI

```bash
npx kairo-cli new my-app     # scaffold a new project
npx kairo-cli routes         # list all registered routes
npx kairo-cli audit          # scan for security anti-patterns
npx kairo-cli ghost          # find unbound handler functions
```

## Architecture

Seven layers, each with a specific role:

1. **Request Membrane** — scores every request with entropy [0–1], tracks tainted inputs
2. **Intent Engine** — _(planned)_ classifies request patterns
3. **Trust Lattice** — claim-based auth, level ordering: none < low < medium < high
4. **Developer Code** — your handlers run here, after all guards pass
5. **Data Shield** — _(planned)_ output sanitization, canary record injection
6. **Runtime Sentinel** — anomaly detection, canary leak detection
7. **DX / Hardening** — validation middleware, dev diagnostics, active blocking

## License

MIT
