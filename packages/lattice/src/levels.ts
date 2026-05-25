import type { TrustLevel } from 'kairo'

const ORDER: Record<TrustLevel, number> = {
  none:   0,
  low:    1,
  medium: 2,
  high:   3,
}

/** Returns true if `claimed` satisfies a requirement of `required`. */
export function meetsLevel(claimed: TrustLevel, required: TrustLevel): boolean {
  return ORDER[claimed] >= ORDER[required]
}

/** Parse a string into a TrustLevel, returning null on unrecognized input. */
export function parseTrustLevel(s: string): TrustLevel | null {
  if (s === 'none' || s === 'low' || s === 'medium' || s === 'high') return s
  return null
}

// Trust level ordering: none(0) < low(1) < medium(2) < high(3).
// A 'high' claim satisfies 'medium' requirements but not vice versa.
