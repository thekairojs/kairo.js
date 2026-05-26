# kairo-lattice

Trust Lattice — claim-based authorization with ordered trust levels.

```bash
npm install @thekairojs/kairo @thekairojs/kairo-lattice
```

```ts
import { createApp } from '@thekairojs/kairo'
import { createLattice } from '@thekairojs/kairo-lattice'

const lattice = createLattice({
  resolve: async (ctx) => ({
    level:   ctx.headers['x-trust'] as TrustLevel ?? 'none',
    roles:   [],
    subject: ctx.headers['x-user-id'] as string,
  }),
})

const app = createApp()
app.use(lattice.resolveMiddleware)

app.get('/public',  handler)
app.get('/private', lattice.require({ level: 'low' }),    handler)
app.get('/admin',   lattice.require({ level: 'high' }),   handler)
app.get('/ops',     lattice.require({ roles: ['ops'] }), handler)
```

## Trust levels

`none < low < medium < high` — `require({ level: 'medium' })` passes `medium` and `high`, rejects `none` and `low`.

## API

### `createLattice(options)`

- `resolve(ctx)` — async function that returns `{ level, roles, subject? }`. Throwing or returning null is treated as anonymous (`level: 'none'`).
- `onDeny(ctx)` — optional. Override the default 403 response on denial.

### `lattice.resolveMiddleware`

Run this early in the chain. It calls `resolve()` once and caches the result in `ctx.kairo.lattice`. Idempotent — safe to include multiple times.

### `lattice.require(opts)`

Returns a middleware that enforces trust. Options:
- `level` — minimum trust level required
- `roles` — one or more roles that must be present
- `all` — when true, *all* listed roles must be present (default: any one)

Denial emits a `lattice_denied` security event and adds `+0.4` entropy.
