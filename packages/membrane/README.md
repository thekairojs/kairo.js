# kairo-membrane

Request Membrane — entropy scoring, taint tracking, IP behavior analysis, HMAC signing.

```bash
npm install @thekairojs/kairo @thekairojs/kairo-membrane
```

```ts
import { createApp } from '@thekairojs/kairo'
import { createMembrane } from '@thekairojs/kairo-membrane'

const app = createApp()
app.use(createMembrane())
```

## What it does

Every request is scored on four axes — the composite score is written to `ctx.kairo.entropy` as a value between `0.0` (clean) and `1.0` (hostile):

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| Header anomalies | 30% | Missing/spoofed UA, scanner signatures, injection characters |
| IP behavior | 35% | Request rate, path diversity, ghost-route hits |
| Payload | 20% | Body size spikes, suspicious content-type |
| Timing | 15% | Request rate relative to rolling baseline |

### Taint tracking

Fields that arrive from untrusted sources (query, body, params) are tracked in `ctx.kairo.taintedPaths`. Validated fields are removed from the set.

### HMAC signing

```ts
import { signHmac, verifyHmac } from '@thekairojs/kairo-membrane'

const sig = signHmac({ userId: 42 }, secret)
const valid = verifyHmac({ userId: 42 }, sig, secret)
```

## Options

```ts
createMembrane({
  exposeDetail: true,   // writes entropy component breakdown to ctx.state
  ipWindow:     60_000, // ms window for IP rate tracking (default: 60s)
  ipLimit:      100,    // max requests per window before IP score spikes
})
```

When `exposeDetail: true`, `ctx.state['kairo.entropy.detail']` contains `{ components, signals }` — consumed by `kairo-dx`'s `devLogger`.
