# kairo-intent

Intent Engine — classifies request origin as `human`, `api`, `bot`, or `scanner`.

```bash
npm install @thekairojs/kairo @thekairojs/kairo-intent
```

```ts
import { createApp } from '@thekairojs/kairo'
import { createMembrane } from '@thekairojs/kairo-membrane'
import { createIntent } from '@thekairojs/kairo-intent'

const app = createApp()
app.use(createMembrane())
app.use(createIntent())

app.get('/data', (ctx) => {
  console.log(ctx.kairo.intent)
  // { type: 'human', confidence: 0.85, signals: ['browser accept header', 'cookies present'], resolved: true }
})
```

## Classification

| Type | Signals |
|------|---------|
| `human` | Mozilla UA, browser Accept, cookies present |
| `api` | Authorization header, JSON-only Accept, programmatic UA |
| `bot` | Googlebot, Bingbot, crawler/spider UA keywords |
| `scanner` | sqlmap, nikto, dirbuster, missing UA, probe paths (/.env, /wp-admin…) |
| `unknown` | No signals matched |

Scanner traffic can optionally elevate the entropy score (default: +0.15 × confidence).

## Options

```ts
createIntent({
  elevateEntropy:     true,   // bump ctx.kairo.entropy for scanner traffic
  scannerEntropyDelta: 0.15,  // per-signal entropy contribution
  onClassified: (ctx, type, confidence) => { /* custom hook */ },
})
```
