# Changelog

## 1.0.0-alpha (2026-05-25)

Initial release of the KAIRO security-substrate framework.

### Packages

- **kairo** `1.0.0-alpha` — core framework: app, router, context, body parser, middleware chain
- **kairo-membrane** `1.0.0-alpha` — entropy scoring (header/IP/payload/timing), taint tracking, HMAC signing, IP tracker with time-bounded distinct-path counting
- **kairo-lattice** `1.0.0-alpha` — claim-based trust lattice with pluggable resolver and per-route enforcement
- **kairo-sentinel** `1.0.0-alpha` — runtime anomaly detection: header anomalies, payload size spikes, canary record leak detection (circular-reference-safe)
- **kairo-hardening** `1.0.0-alpha` — active entropy-based request blocking with configurable threshold, status code, and onExceed hook
- **kairo-dx** `1.0.0-alpha` — schema validation middleware (string/number/boolean/object/array, nested, coercion for query params) and dev logger with full security diagnostics
- **kairo-cli** `1.0.0-alpha` — `kairo` binary: `new`, `routes`, `audit`, `ghost` commands with ASCII TUI

### Test coverage

371 tests across 7 packages — all passing.

### Known gaps (planned for 1.0.0)

- Intent Engine (Layer 2)
- Data Shield (Layer 5)
- Prisma and uWS adapters
- Ghost route → IP tracker event wiring
