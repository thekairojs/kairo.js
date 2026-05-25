# kairo-shield

Data Shield — scans outbound response bodies for PII and sensitive strings before they leave the process.

```bash
npm install kairo kairo-shield
```

```ts
import { createApp } from 'kairo'
import { createShield } from 'kairo-shield'

const app = createApp()
app.use(createShield({ pii: true }))  // place at the top — wraps all handlers
```

## PII detection

The shield scans JSON response bodies for:

| Pattern | Example |
|---------|---------|
| Email | `user@example.com` |
| Credit card | `4111111111111111` |
| SSN | `123-45-6789` |
| US phone | `(555) 867-5309` |
| JWT | `eyJ...` |
| AWS access key | `AKIA...` |
| Private IPv4 | `192.168.x.x` |

Detections emit a `taint_neutralized` security event. Only the first 4 chars of a match are stored — the full value is never logged.

## Options

```ts
createShield({
  pii:              true,    // scan for PII patterns (default: true)
  redact:           false,   // replace PII fields with "[REDACTED]" (default: false)
  sensitiveStrings: ['sk_live_', 'ghp_'],  // substring matches in serialized body
  onPii: (ctx, matches) => {
    console.warn('PII in response:', matches)
    return true  // return false to suppress the security event
  },
})
```

## Redaction

When `redact: true`, matched fields are replaced in the response body:

```json
// before
{ "email": "alice@example.com", "name": "Alice" }

// after
{ "email": "[REDACTED]", "name": "Alice" }
```
