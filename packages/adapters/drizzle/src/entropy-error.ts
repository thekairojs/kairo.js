export class KairoEntropyError extends Error {
  readonly entropy: number
  readonly threshold: number

  constructor(entropy: number, threshold: number) {
    super(
      `Query blocked: request entropy ${entropy.toFixed(2)} exceeds threshold ${threshold}. ` +
      'This request is flagged as high-risk.'
    )
    this.name = 'KairoEntropyError'
    this.entropy = entropy
    this.threshold = threshold
  }
}
