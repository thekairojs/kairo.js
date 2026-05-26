# kairo-hardening

Active entropy-based request blocking. Place after `kairo-membrane` to reject high-entropy requests before they reach your handlers.

```bash
npm install @thekairojs/kairo @thekairojs/kairo-hardening
```

```ts
import { createApp } from '@thekairojs/kairo'
import { createMembrane } from '@thekairojs/kairo-membrane'
import { createHardening } from '@thekairojs/kairo-hardening'

const app = createApp()
app.use(createMembrane())
app.use(createHardening({ threshold: 0.75 }))
```

## Options

```ts
createHardening({
  threshold: 0.75,           // entropy >= this triggers the action [0–1]. Default: 0.75
  action:    'block',        // 'block' (default) or 'log' (pass through but emit event)
  status:    429,            // HTTP status on block. Default: 429
  message:   'Request rejected',
  onExceed:  async (ctx, entropy) => {
    await alertSlack(`entropy spike: ${entropy} on ${ctx.path}`)
  },
})
```

## Modes

| Mode | Behaviour |
|------|-----------|
| `block` | Sends HTTP response, stops middleware chain |
| `log` | Emits `entropy_spike` event, calls `onExceed`, passes through |

`log` mode is useful for gradual rollout — observe what would be blocked before enabling `block`.

Both modes emit an `entropy_spike` security event on `ctx.kairo.events`.
