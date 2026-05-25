export { createSentinel, createSentinelMiddleware } from './sentinel.js'
export type { SentinelOptions } from './sentinel.js'

export { checkSql, checkPath, checkShell, checkTemplate } from './sinks.js'
export type { SinkType, SinkViolation } from './sinks.js'

export {
  createCanary,
  isCanaryToken,
  scanForCanary,
  revokeCanary,
  canaryRegistrySize,
} from './canary.js'
