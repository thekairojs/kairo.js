# kairo

Core framework. App, router, context, body parser, middleware chain.

```bash
npm install @thekairojs/kairo
```

```ts
import { createApp } from '@thekairojs/kairo'

const app = createApp()

app.get('/hello', (ctx) => {
  ctx.json({ hello: 'world' })
})

await app.listen(3000)
```

## API

### `createApp(config?)`

Returns a `KairoAppInstance`. Config options:
- `trustProxy` — trust `X-Forwarded-For` for IP extraction. Default `false`.
- `ghostRoutes` — enable ghost route tracking. Default `true`.

### Context (`ctx`)

| Property | Type | Description |
|----------|------|-------------|
| `method` | `HttpMethod` | GET, POST, etc. |
| `path` | `string` | URL path without query |
| `query` | `Record<string, string>` | Parsed query params |
| `params` | `Record<string, string>` | Route params (`:id`, `*`) |
| `headers` | `Record<string, string>` | Request headers |
| `body` | `unknown` | Parsed request body |
| `ip` | `string` | Client IP |
| `kairo` | `KairoSecurityContext` | Security context (entropy, events, lattice…) |
| `state` | `Record<string, unknown>` | Per-request middleware state |

### Middleware

```ts
app.use(async (ctx, next) => {
  // before
  await next()
  // after
})
```

### Route groups

```ts
const api = app.group('/api', { middleware: [authMiddleware] })
api.get('/users', handler)
api.post('/users', handler)
```

### Ghost routes

Decoy endpoints that log and flag any access as suspicious:

```ts
app.ghost('/admin/backdoor')
app.ghost('/.env', { alertLevel: 'high' })
```
