# kairo-dx

DX Layer — schema validation middleware and dev-mode request diagnostics.

```bash
npm install @thekairojs/kairo @thekairojs/kairo-dx
```

## Schema validation

```ts
import { validate } from '@thekairojs/kairo-dx'

app.post('/users', validate({
  body: {
    name:  { type: 'string',  required: true, max: 50 },
    email: { type: 'string',  required: true, pattern: /^[^@]+@[^@]+$/ },
    age:   { type: 'number',  min: 0, max: 150 },
    role:  { type: 'string',  enum: ['admin', 'user', 'guest'] },
    active: { type: 'boolean' },
  },
  query: {
    page: { type: 'number', min: 1 },
  },
}), handler)
```

Failures respond with `422 Unprocessable Entity` and a full list of field errors:

```json
{
  "error": "Validation failed",
  "errors": [
    { "field": "body.email", "message": "required" },
    { "field": "body.age",   "message": "must be ≤ 150" }
  ]
}
```

Query params are automatically coerced: `"42"` → `42` for `type: 'number'`, `"true"` → `true` for `type: 'boolean'`.

Validation failures elevate entropy (`+0.1`) and emit a `taint_neutralized` event.

## Dev logger

```ts
import { devLogger } from '@thekairojs/kairo-dx'

app.use(devLogger())
// or
app.use(devLogger({ enabled: process.env.NODE_ENV !== 'production' }))
```

Logs per-request security diagnostics after each response:

```
[kairo] GET /api/users — 200 — 4ms
  entropy: 0.120
  events:  none
  tainted: query.search
  lattice: low / u-99 / [user]
```

With `kairo-membrane`'s `exposeDetail: true`, also shows the component breakdown and active signals.

### `devLogger` options

- `enabled` — boolean, default `process.env.NODE_ENV !== 'production'`
- `write(line)` — override output sink (useful in tests to capture without mocking console)
