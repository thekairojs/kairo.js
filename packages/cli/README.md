# kairo-cli

`kairo` CLI — project scaffolding, route inspection, and security audit.

```bash
npm install -g kairo-cli
# or
npx kairo-cli <command>
```

## Commands

### `kairo new <name>`

Scaffold a new KAIRO project in `./<name>/`:

```bash
kairo new my-api
cd my-api
npm install
npm run dev
```

Generates `package.json`, `tsconfig.json`, `src/index.ts`, `.gitignore`.

### `kairo routes`

Scan source files and list all registered routes:

```bash
kairo routes               # static scan of src/
kairo routes --src lib/    # custom source directory
kairo routes --app dist/index.js  # load from a running app module (uses getRoutes())
```

### `kairo audit`

Scan for security anti-patterns:

```bash
kairo audit
kairo audit --src src/
```

Checks for: `eval()`, `new Function()`, dynamic shell commands, prototype pollution, hardcoded secrets, SQL string concatenation, user-controlled RegExp, unguarded mutating routes, sensitive fields in `console.log`.

### `kairo ghost`

Find exported handler-shaped functions that have no matching route registration:

```bash
kairo ghost
kairo ghost --src src/
```

Flags functions that take a `ctx` argument but aren't wired to any `app.*` call nearby — potential unguarded entry points.

## Global flags

```
--src <dir>    Source directory to scan (default: src/)
--app <path>   App entry point for dynamic route loading
-h, --help     Show help
-v, --version  Print version
```
