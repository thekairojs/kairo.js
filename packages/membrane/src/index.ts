/**
 * kairo-membrane — Public API
 *
 * Request Membrane: entropy scoring, header fingerprinting,
 * IP behaviour tracking, HMAC envelope verification, taint propagation.
 */

// ── Membrane plugin / middleware factory ─────────────────────────────────────
export { createMembrane, createMembraneMiddleware } from './membrane.js'
export type { MembraneOptions } from './membrane.js'

// ── Entropy scoring (usable standalone) ──────────────────────────────────────
export { computeEntropy, measureJsonDepth } from './entropy.js'
export type { EntropyInput, EntropyResult } from './entropy.js'

// ── Header fingerprinting ─────────────────────────────────────────────────────
export { fingerprintHeaders } from './fingerprint.js'
export type { FingerprintResult } from './fingerprint.js'

// ── IP behaviour tracking ─────────────────────────────────────────────────────
export { IpTracker, defaultIpTracker } from './ip-tracker.js'
export type { IpSnapshot, IpTrackerOptions } from './ip-tracker.js'

// ── HMAC envelope ─────────────────────────────────────────────────────────────
export { sign, verify, verifySignature, SIGNATURE_HEADER, SIGNATURE_PREFIX } from './hmac.js'
export type { HmacOptions } from './hmac.js'

// ── Taint propagation ─────────────────────────────────────────────────────────
export { propagateTaint, isTainted, isAncestorTainted } from './taint.js'
