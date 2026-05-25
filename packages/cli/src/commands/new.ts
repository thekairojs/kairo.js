import fs from 'node:fs'
import path from 'node:path'
import { bold, c, dim } from '../ui/ansi.js'
import { badge, divider, indent } from '../ui/layout.js'
import { spinner } from '../ui/spinner.js'

// ─── Embedded templates ───────────────────────────────────────────────────────

const PKG = (name: string) => JSON.stringify({
  name,
  version: '0.0.1',
  private: true,
  type: 'module',
  scripts: { dev: 'node --watch dist/index.js', build: 'tsc', start: 'node dist/index.js' },
  dependencies: { kairo: 'latest' },
  devDependencies: { typescript: '^5.4.0' },
}, null, 2)

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    outDir: './dist',
    strict: true,
    skipLibCheck: true,
  },
  include: ['src'],
}, null, 2)

const INDEX_TS = `import { createApp } from 'kairo'
import { createMembrane } from 'kairo/membrane'

const app = createApp()

app.use(createMembrane())

app.get('/health', (ctx) => {
  ctx.json({ ok: true, ts: Date.now() })
})

const port = Number(process.env['PORT'] ?? 3000)
await app.listen(port)
console.log(\`Listening on http://localhost:\${port}\`)
`

const GITIGNORE = `node_modules/
dist/
.env
*.log
`

// ─── Scaffold logic ───────────────────────────────────────────────────────────

export async function runNew(name: string | undefined): Promise<void> {
  if (!name || name.trim() === '') {
    console.error(c('red', 'Error:') + ' provide a project name   kairo new <name>')
    process.exit(1)
  }

  const projectName = name.trim()
  const dest = path.resolve(process.cwd(), projectName)

  if (fs.existsSync(dest)) {
    console.error(c('red', 'Error:') + ` directory "${projectName}" already exists`)
    process.exit(1)
  }

  const spin = spinner(`Scaffolding ${bold(projectName)}…`)

  try {
    fs.mkdirSync(dest, { recursive: true })
    fs.mkdirSync(path.join(dest, 'src'))

    const write = (rel: string, content: string) =>
      fs.writeFileSync(path.join(dest, rel), content, 'utf8')

    write('package.json',   PKG(projectName))
    write('tsconfig.json',  TSCONFIG)
    write('src/index.ts',   INDEX_TS)
    write('.gitignore',     GITIGNORE)

    spin.stop(`${badge('done', 'ok')} ${bold(projectName)} created`)
  } catch (err) {
    spin.stop(c('red', 'Failed'))
    console.error(err)
    process.exit(1)
  }

  console.log()
  console.log(divider('next steps'))
  console.log(indent([
    `${dim('$')} cd ${projectName}`,
    `${dim('$')} npm install`,
    `${dim('$')} npm run dev`,
  ].join('\n')))
  console.log()
}
