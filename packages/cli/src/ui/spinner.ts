import { ansi, c } from './ansi.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const INTERVAL_MS = 80

export interface Spinner {
  stop(finalText?: string): void
}

export function spinner(label: string): Spinner {
  let frame = 0
  let timer: ReturnType<typeof setInterval> | null = null

  const tick = () => {
    process.stdout.write(`${ansi.clearLine}${c('cyan', FRAMES[frame % FRAMES.length]!)} ${label}`)
    frame++
  }

  tick()
  timer = setInterval(tick, INTERVAL_MS)

  return {
    stop(finalText?: string) {
      if (timer) { clearInterval(timer); timer = null }
      if (finalText !== undefined) {
        process.stdout.write(`${ansi.clearLine}${finalText}\n`)
      } else {
        process.stdout.write(`${ansi.clearLine}`)
      }
    },
  }
}
