import { banner, divider } from './ui/layout.js'
import { bold, c, dim } from './ui/ansi.js'
import { runNew }    from './commands/new.js'
import { runRoutes } from './commands/routes.js'
import { runAudit }  from './commands/audit.js'
import { runGhost }  from './commands/ghost.js'

const VERSION = '1.0.0-alpha'

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseFlag(args: string[], flag: string): string | true | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1) return undefined
  const next = args[idx + 1]
  if (next && !next.startsWith('-')) return next
  return true
}

function hasFlag(args: string[], ...flags: string[]): boolean {
  return flags.some(f => args.includes(f))
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(banner(VERSION))
  console.log(divider('commands'))
  console.log()

  const cmds: [string, string][] = [
    ['kairo new <name>',            'scaffold a new KAIRO project'],
    ['kairo routes',                'list registered routes (static scan)'],
    ['kairo routes --app <path>',   'load routes from a running app module'],
    ['kairo audit',                 'scan source for security anti-patterns'],
    ['kairo ghost',                 'find exported handlers with no route binding'],
  ]

  const w = Math.max(...cmds.map(([cmd]) => cmd.length)) + 2
  cmds.forEach(([cmd, desc]) => {
    console.log(`  ${bold(cmd.padEnd(w))}  ${dim(desc)}`)
  })

  console.log()
  console.log(divider('global flags'))
  console.log()

  const flags: [string, string][] = [
    ['--src <dir>',  'source directory to scan (default: src/)'],
    ['--app <path>', 'app entry point for dynamic route loading'],
    ['-h, --help',   'show this help'],
    ['-v, --version','print version'],
  ]

  const fw = Math.max(...flags.map(([f]) => f.length)) + 2
  flags.forEach(([flag, desc]) => {
    console.log(`  ${c('cyan', flag.padEnd(fw))}  ${dim(desc)}`)
  })

  console.log()
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const cmd  = args[0]

  if (!cmd || hasFlag(args, '-h', '--help')) {
    printHelp()
    return
  }

  if (hasFlag(args, '-v', '--version')) {
    console.log(VERSION)
    return
  }

  const src = (parseFlag(args, '--src') as string | undefined)
  const app = (parseFlag(args, '--app') as string | undefined)

  switch (cmd) {
    case 'new':
      await runNew(args[1])
      break

    case 'routes':
      await runRoutes({ src, app })
      break

    case 'audit':
      await runAudit({ src })
      break

    case 'ghost':
      await runGhost({ src })
      break

    default:
      console.error(c('red', 'Unknown command:') + ` ${cmd}`)
      console.error(dim('Run `kairo --help` for usage.'))
      process.exit(1)
  }
}

main().catch(err => {
  console.error(c('red', 'Fatal:'), err instanceof Error ? err.message : String(err))
  process.exit(1)
})
