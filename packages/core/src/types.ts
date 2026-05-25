import type { IncomingMessage, ServerResponse } from 'node:http'

// ─── HTTP Types ───

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

export interface KairoRequest {
  readonly method: HttpMethod
  readonly url: string
  readonly path: string
  readonly query: Record<string, string | undefined>
  readonly params: Record<string, string>
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  readonly ip: string
  body: unknown
  readonly raw: IncomingMessage
}

export interface KairoResponse {
  readonly raw: ServerResponse
  statusCode: number
  headers: Record<string, string>
  body: unknown
  sent: boolean
  pendingFlush: boolean
}

// ─── Security Context ───

/**
 * @internal - do not modify from application code.
 * Security context fields are managed internally by the Kairo framework.
 */
export interface KairoSecurityContext {
  entropy: number
  taintedPaths: Set<string>
  ghostRouteTriggered: boolean
  hardeningActive: boolean
  overrides: SecurityOverride[]
  events: SecurityEvent[]
  lattice: LatticeContext
  intent: IntentContext
}

export type IntentType = 'human' | 'api' | 'bot' | 'scanner' | 'unknown'

export interface IntentContext {
  type: IntentType
  confidence: number
  signals: string[]
  resolved: boolean
}

export interface SecurityOverride {
  layer: string
  route: string
  reason: string
  timestamp: number
}

export interface SecurityEvent {
  type: SecurityEventType
  route: string
  detail: string
  timestamp: number
  entropy: number
}

export type SecurityEventType =
  | 'ghost_route_hit'
  | 'taint_neutralized'
  | 'entropy_spike'
  | 'intent_drift'
  | 'poison_pill_triggered'
  | 'lattice_denied'
  | 'shadow_execution'
  | 'patch_applied'
  | 'prototype_pollution'
  | 'memory_pressure'
  | 'canary_triggered'

// ─── Context ───

export interface KairoContext {
  readonly req: KairoRequest
  readonly res: KairoResponse
  readonly kairo: KairoSecurityContext

  readonly method: HttpMethod
  readonly path: string
  readonly url: string
  readonly query: Record<string, string | undefined>
  readonly params: Record<string, string>
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  readonly ip: string
  body: unknown

  json(data: unknown, status?: number): void
  text(data: string, status?: number): void
  html(data: string, status?: number): void
  send(data: unknown, status?: number): void
  status(code: number): KairoContext
  set(name: string, value: string): KairoContext
  get(name: string): string | string[] | undefined
  redirect(url: string, status?: number): void

  state: Record<string, unknown>
}

// ─── Route Types ───

// Intentionally permissive: handlers may return a value (auto-send) or a Promise of one.
export type Handler = (ctx: KairoContext) => Promise<unknown> | unknown

export type Middleware = (
  ctx: KairoContext,
  next: () => Promise<void>,
) => unknown | Promise<unknown>

export type TrustLevel = 'none' | 'low' | 'medium' | 'high'

export interface TrustClaims {
  /** Verified trust level for this request */
  level: TrustLevel
  /** Roles granted to the caller */
  roles: string[]
  /** Identity of the caller — user ID, service name, etc. */
  subject?: string
}

export interface LatticeContext {
  /** Claims resolved by the lattice middleware. Null until resolved. */
  claims: TrustClaims | null
  resolved: boolean
}
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface RouteOptions {
  intent?: string
  risk?: RiskLevel
  requires?: string
  trust?: TrustLevel | 'none'
  reason?: string
  tags?: string[]
  kairo?: LayerOverrides
  handler: Handler
}

export interface LayerOverrides {
  membrane?: boolean
  sentinel?: boolean
  shield?: boolean
  lattice?: boolean
  hardening?: boolean
}

export interface RouteDefinition {
  method: HttpMethod
  path: string
  handler: Handler
  middleware: Middleware[]
  options: Partial<RouteOptions>
}

// ─── App Config ───

export interface KairoConfig {
  /**
   * When true, the X-Forwarded-For header is trusted for IP extraction.
   * Default: false. Only enable when behind a trusted reverse proxy.
   */
  trustProxy?: boolean
  /**
   * When false, ghost route checking is disabled entirely.
   * Default: true.
   */
  ghostRoutes?: boolean
}

// ─── App Types ───

export interface ServerAdapter {
  listen(port: number, hostname?: string): Promise<void>
  close(): Promise<void>
}

export interface KairoPlugin {
  name: string
  version: string
  onRequest?: Middleware
  onSecurityEvent?: (event: SecurityEvent) => void | Promise<void>
  install?: (app: KairoAppInstance) => void | Promise<void>
}

export interface KairoAppInstance {
  get(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  post(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  put(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  delete(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  patch(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  head(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  options(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void

  use(middleware: Middleware | KairoPlugin): void
  group(prefix: string, options?: { middleware?: Middleware[] }): RouteGroup

  ghost(path: string, options?: GhostRouteOptions): void

  getRoutes(): readonly RouteDefinition[]

  listen(port: number, hostname?: string): Promise<void>
  close(): Promise<void>

  onError(handler: ErrorHandler): void
  onNotFound(handler: Handler): void
}

export interface RouteGroup {
  get(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  post(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  put(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  delete(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  patch(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void
  use(middleware: Middleware): void
}

export interface GhostRouteOptions {
  response?: unknown
  alertLevel?: 'low' | 'medium' | 'high'
}

export type ErrorHandler = (
  error: Error,
  ctx: KairoContext,
) => unknown | Promise<unknown>
