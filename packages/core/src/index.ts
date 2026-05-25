export { KairoApp } from './app.js'
export { Router } from './router.js'
export { createContext, createRequest, createResponse, flushResponse, emitSecurityEvent } from './context.js'
export { compose } from './middleware.js'
export { parseBody } from './body-parser.js'
export { createHttpAdapter } from './server.js'

export type {
  KairoAppInstance,
  KairoContext,
  KairoRequest,
  KairoResponse,
  KairoSecurityContext,
  KairoConfig,
  HttpMethod,
  Handler,
  Middleware,
  RouteOptions,
  RouteDefinition,
  RouteGroup,
  GhostRouteOptions,
  ErrorHandler,
  KairoPlugin,
  ServerAdapter,
  SecurityEvent,
  SecurityEventType,
  SecurityOverride,
  TrustLevel,
  TrustClaims,
  LatticeContext,
  IntentType,
  IntentContext,
  RiskLevel,
  LayerOverrides,
} from './types.js'

import { KairoApp } from './app.js'
import type { KairoConfig, KairoAppInstance } from './types.js'

// L2: explicit return type so the concrete class isn't leaked
export function createApp(config?: KairoConfig): KairoAppInstance {
  return new KairoApp(config)
}
