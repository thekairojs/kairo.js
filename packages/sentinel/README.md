# kairo-sentinel

Runtime Sentinel — anomaly detection, canary record leak detection.

```bash
npm install @thekairojs/kairo @thekairojs/kairo-sentinel
```

```ts
import { createApp } from '@thekairojs/kairo'
import { createSentinel, createCanary, scanForCanary } from '@thekairojs/kairo-sentinel'

const app = createApp()
app.use(createSentinel())
```

## Anomaly detection

The sentinel scans each request for:
- Header anomalies (oversized values, control characters, injection patterns)
- Payload size spikes relative to rolling average
- Path traversal attempts

Detections raise `entropy_spike` security events on `ctx.kairo.events`.

## Canary records

Canary tokens are 16-byte hex values injected into database rows. If one leaks into an API response it means someone exfiltrated data from a path that shouldn't have access.

```ts
import { createCanary, scanForCanary } from '@thekairojs/kairo-sentinel'

// When writing to the DB
const row = { id: userId, name: 'Alice', _canary: createCanary(`user:${userId}`) }

// In a response handler or shield
if (scanForCanary(responseBody)) {
  // canary leak detected
}
```

Canaries are stored in a process-level registry (survives across requests, resets on process restart). The scanner is circular-reference-safe.
