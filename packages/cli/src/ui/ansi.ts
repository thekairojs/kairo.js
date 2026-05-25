const ESC = '\x1b['

export const ansi = {
  reset:     `${ESC}0m`,
  bold:      `${ESC}1m`,
  dim:       `${ESC}2m`,
  italic:    `${ESC}3m`,
  underline: `${ESC}4m`,

  black:   `${ESC}30m`,
  red:     `${ESC}31m`,
  green:   `${ESC}32m`,
  yellow:  `${ESC}33m`,
  blue:    `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan:    `${ESC}36m`,
  white:   `${ESC}37m`,
  gray:    `${ESC}90m`,

  bgBlack:   `${ESC}40m`,
  bgRed:     `${ESC}41m`,
  bgGreen:   `${ESC}42m`,
  bgYellow:  `${ESC}43m`,
  bgBlue:    `${ESC}44m`,
  bgMagenta: `${ESC}45m`,
  bgCyan:    `${ESC}46m`,
  bgWhite:   `${ESC}47m`,

  clearLine: `\r${ESC}2K`,
  up:        (n = 1) => `${ESC}${n}A`,
}

export function c(color: keyof typeof ansi, text: string): string {
  return `${ansi[color]}${text}${ansi.reset}`
}

export function bold(text: string): string {
  return `${ansi.bold}${text}${ansi.reset}`
}

export function dim(text: string): string {
  return `${ansi.dim}${text}${ansi.reset}`
}

// strip all ANSI codes — used to measure visual width
export function strip(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

export function visLen(text: string): number {
  return strip(text).length
}
