import type { KairoAppInstance, KairoContext, KairoPlugin, Middleware } from '@thekairojs/kairo'

// ─── Browser client script ────────────────────────────────────────────────────
// Compact IIFE that collects timing/motion signals and beacons them to the server.

export const BIOMETRICS_CLIENT_SCRIPT = `(function(){
  var sid = (document.cookie.match(/kairo_bio=([^;]+)/)||[])[1] || Math.random().toString(36).slice(2);
  document.cookie = 'kairo_bio=' + sid + '; SameSite=Strict';
  var ep = window.__KAIRO_BIO_EP__ || '/kairo/biometrics';
  var mx=[],ky=[],sc=[],lm=0,lk=0,sent=false;
  function bucket(v,b){return Math.floor(v/b)*b;}
  document.addEventListener('mousemove',function(e){
    var t=performance.now(),dt=t-lm,dx=e.movementX,dy=e.movementY;
    if(dt>0&&dt<500){var v=Math.sqrt(dx*dx+dy*dy)/dt;mx.push(bucket(v,0.1));}
    lm=t;
  });
  document.addEventListener('keydown',function(){
    var t=performance.now(),dt=t-lk;
    if(lk>0&&dt<2000)ky.push(bucket(dt,10));
    lk=t;
  });
  window.addEventListener('scroll',function(){
    var t=performance.now(),dt=t-lm;
    if(dt>0&&dt<1000)sc.push(bucket(window.scrollY,50));
    lm=t;
  });
  function beacon(){
    if(sent)return;sent=true;
    var data={s:sid,mx:mx.slice(-40),ky:ky.slice(-40),sc:sc.slice(-20)};
    navigator.sendBeacon(ep,JSON.stringify(data));
  }
  document.addEventListener('visibilitychange',function(){if(document.hidden)beacon();});
  setTimeout(beacon,12000);
  window.addEventListener('beforeunload',beacon);
})();`

// ─── Signal analysis ──────────────────────────────────────────────────────────

export interface BiometricsSignal {
  /** Session ID (from cookie) */
  s: string
  /** Mouse velocity buckets */
  mx: number[]
  /** Key interval buckets (ms) */
  ky: number[]
  /** Scroll Y position samples */
  sc: number[]
}

export interface BiometricsScore {
  sessionId: string
  score: number      // 0.0 (bot) → 1.0 (human)
  signals: string[]
  updatedAt: number
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function uniqueCount(arr: number[]): number {
  return new Set(arr).size
}

export function analyzeSignals(signal: BiometricsSignal): BiometricsScore {
  const signals: string[] = []
  let score = 0.5

  // Mouse: human movement has velocity variety; bots have none or linear motion
  if (signal.mx.length > 5) {
    const variety = uniqueCount(signal.mx) / signal.mx.length
    if (variety > 0.4) { score += 0.2; signals.push('mouse-variety') }
    else if (variety < 0.15) { score -= 0.2; signals.push('mouse-monotone') }
  } else {
    signals.push('mouse-absent')
    score -= 0.1
  }

  // Keystroke timing: human typing has std dev 20-400ms relative to mean
  if (signal.ky.length > 3) {
    const mean = signal.ky.reduce((a, b) => a + b, 0) / signal.ky.length
    const sd = stddev(signal.ky)
    const cv = mean > 0 ? sd / mean : 0
    if (cv > 0.15 && cv < 2.0) { score += 0.2; signals.push('key-rhythm') }
    else if (cv < 0.05) { score -= 0.25; signals.push('key-mechanical') }
    else { signals.push('key-erratic') }
  }

  // Scroll: any scroll is a positive indicator
  if (signal.sc.length > 2) {
    const variety = uniqueCount(signal.sc) / signal.sc.length
    if (variety > 0.3) { score += 0.1; signals.push('scroll-human') }
  }

  return {
    sessionId: signal.s,
    score: Math.max(0, Math.min(1, score)),
    signals,
    updatedAt: Date.now(),
  }
}

// ─── Session store ────────────────────────────────────────────────────────────

const MAX_SESSIONS = 2000

export class BiometricsStore {
  private readonly sessions = new Map<string, BiometricsScore>()

  set(score: BiometricsScore): void {
    if (this.sessions.size >= MAX_SESSIONS) {
      // Evict oldest entry
      const firstKey = this.sessions.keys().next().value
      if (firstKey !== undefined) this.sessions.delete(firstKey)
    }
    this.sessions.set(score.sessionId, score)
  }

  get(sessionId: string): BiometricsScore | undefined {
    return this.sessions.get(sessionId)
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }
}

export const defaultBiometricsStore = new BiometricsStore()

// ─── Middleware ───────────────────────────────────────────────────────────────

export interface BiometricsOptions {
  /**
   * URL path for both the client script (GET) and the beacon endpoint (POST).
   * Default: '/kairo/biometrics'
   */
  endpoint?: string

  /**
   * Custom store. Defaults to the shared in-process singleton.
   */
  store?: BiometricsStore

  /**
   * When true, a low biometrics score (<0.35) adds 0.2 to ctx.kairo.entropy.
   * Default: true
   */
  adjustEntropy?: boolean
}

/**
 * Behavioral Biometrics — browser client SDK + server-side analysis.
 *
 * Serves a tiny JS beacon collector at `GET {endpoint}` and receives
 * behavioral signals at `POST {endpoint}`. Scores are stored per session
 * and optionally used to adjust the entropy of subsequent requests.
 *
 * ```ts
 * app.use(createMembrane())
 * app.use(createBiometrics())
 * // In your HTML: <script src="/kairo/biometrics"></script>
 * ```
 */
export function createBiometrics(options: BiometricsOptions = {}): KairoPlugin {
  const endpoint = options.endpoint ?? '/kairo/biometrics'
  const store = options.store ?? defaultBiometricsStore
  const adjustEntropy = options.adjustEntropy ?? true

  // Per-request entropy adjustment (runs on all matched routes)
  const onRequest: Middleware = async (ctx: KairoContext, next: () => Promise<void>) => {
    if (adjustEntropy) {
      const sessionId = _extractSessionId(ctx)
      if (sessionId) {
        const scored = store.get(sessionId)
        if (scored && scored.score < 0.35) {
          ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.2 * (1 - scored.score), 1.0)
        }
      }
    }
    await next()
  }

  let installed = false

  return {
    name: 'kairo-biometrics',
    version: '1.1.0',
    onRequest,

    install(app: KairoAppInstance): void {
      if (installed) return
      installed = true

      // Serve client script
      app.get(endpoint, (ctx: KairoContext) => {
        ctx.text(BIOMETRICS_CLIENT_SCRIPT)
        // Override after text() since text() hard-codes text/plain
        ctx.set('Content-Type', 'text/javascript; charset=utf-8')
        ctx.set('Cache-Control', 'public, max-age=3600')
      })

      // Receive beacon
      app.post(endpoint, (ctx: KairoContext) => {
        try {
          const raw = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body
          const signal = raw as BiometricsSignal
          if (signal && typeof signal.s === 'string') {
            const scored = analyzeSignals(signal)
            store.set(scored)
          }
        } catch {
          // Silently drop malformed beacons
        }
        ctx.json({ ok: true })
      })
    },
  }
}

function _extractSessionId(ctx: KairoContext): string | undefined {
  const cookie = ctx.headers['cookie']
  if (!cookie) return undefined
  const raw = Array.isArray(cookie) ? cookie.join('; ') : cookie
  const m = raw.match(/kairo_bio=([^;]+)/)
  return m?.[1]
}
