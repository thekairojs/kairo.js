import type { KairoContext, Middleware } from 'kairo'
import { emitSecurityEvent } from 'kairo'

export type SchemaFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface FieldSchema {
  type: SchemaFieldType
  /** Field must be present and non-empty. Default: false. */
  required?: boolean
  /**
   * For strings: minimum character length.
   * For numbers: minimum value.
   */
  min?: number
  /**
   * For strings: maximum character length.
   * For numbers: maximum value.
   */
  max?: number
  /** String only — value must match this regex. */
  pattern?: RegExp
  /** Value must be strictly equal to one of these. */
  enum?: unknown[]
  /** Array only — schema applied to every element. */
  items?: FieldSchema
  /** Object only — schema applied to named child keys. */
  properties?: ObjectSchema
}

export type ObjectSchema = Record<string, FieldSchema>

export interface ValidateOptions {
  /**
   * Validates ctx.body (expects a parsed JSON object).
   * Returns 422 if body is absent when required fields are declared.
   */
  body?: ObjectSchema
  /**
   * Validates ctx.query string values.
   * type:'number' / type:'boolean' fields accept their string representations
   * ('42', 'true') and check the coerced value against min/max constraints.
   */
  query?: ObjectSchema
  /**
   * Validates ctx.params string values. Same coercion rules as query.
   */
  params?: ObjectSchema
}

export interface ValidationError {
  /** Dot-notation path of the failing field, e.g. 'body.email' or 'query.page'. */
  field: string
  /** Human-readable constraint that failed. */
  message: string
}

// ─── Internal validators ──────────────────────────────────────────────────────

function validateField(
  value: unknown,
  schema: FieldSchema,
  path: string,
  fromString: boolean,
): ValidationError[] {
  const errors: ValidationError[] = []

  const absent = value === undefined || value === null || value === ''
  if (absent) {
    if (schema.required) errors.push({ field: path, message: 'required' })
    return errors
  }

  // For query/params every value arrives as a string — coerce before type-checking
  let typed = value
  if (fromString && typeof value === 'string') {
    if (schema.type === 'number') {
      const n = Number(value)
      if (!Number.isFinite(n)) {
        errors.push({ field: path, message: 'must be a number' })
        return errors
      }
      typed = n
    } else if (schema.type === 'boolean') {
      if (value !== 'true' && value !== 'false') {
        errors.push({ field: path, message: 'must be true or false' })
        return errors
      }
      typed = value === 'true'
    }
  }

  // Type guards
  if (schema.type === 'string' && typeof typed !== 'string') {
    errors.push({ field: path, message: 'must be a string' })
    return errors
  }
  if (schema.type === 'number' && typeof typed !== 'number') {
    errors.push({ field: path, message: 'must be a number' })
    return errors
  }
  if (schema.type === 'boolean' && typeof typed !== 'boolean') {
    errors.push({ field: path, message: 'must be a boolean' })
    return errors
  }
  if (schema.type === 'object' && (typeof typed !== 'object' || Array.isArray(typed) || typed === null)) {
    errors.push({ field: path, message: 'must be an object' })
    return errors
  }
  if (schema.type === 'array' && !Array.isArray(typed)) {
    errors.push({ field: path, message: 'must be an array' })
    return errors
  }

  // String constraints
  if (typeof typed === 'string') {
    if (schema.min !== undefined && typed.length < schema.min)
      errors.push({ field: path, message: `must be at least ${schema.min} characters` })
    if (schema.max !== undefined && typed.length > schema.max)
      errors.push({ field: path, message: `must be at most ${schema.max} characters` })
    if (schema.pattern && !schema.pattern.test(typed))
      errors.push({ field: path, message: 'does not match required pattern' })
  }

  // Number constraints
  if (typeof typed === 'number') {
    if (schema.min !== undefined && typed < schema.min)
      errors.push({ field: path, message: `must be at least ${schema.min}` })
    if (schema.max !== undefined && typed > schema.max)
      errors.push({ field: path, message: `must be at most ${schema.max}` })
  }

  // Enum check — run after type coercion so numeric enums work for query params
  if (schema.enum !== undefined && !schema.enum.includes(typed))
    errors.push({ field: path, message: `must be one of: ${schema.enum.join(', ')}` })

  // Nested object
  if (schema.type === 'object' && schema.properties) {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      errors.push(...validateField(
        (typed as Record<string, unknown>)[key],
        childSchema,
        `${path}.${key}`,
        fromString,
      ))
    }
  }

  // Array items
  if (schema.type === 'array' && schema.items) {
    for (let i = 0; i < (typed as unknown[]).length; i++) {
      errors.push(...validateField(
        (typed as unknown[])[i],
        schema.items,
        `${path}[${i}]`,
        fromString,
      ))
    }
  }

  return errors
}

function validateObject(
  data: unknown,
  schema: ObjectSchema,
  prefix: string,
  fromString = false,
): ValidationError[] {
  // If the data source is absent or not an object, flag every required field
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return Object.entries(schema)
      .filter(([, s]) => s.required)
      .map(([key]) => ({ field: `${prefix}.${key}`, message: 'required' }))
  }

  const obj = data as Record<string, unknown>
  const errors: ValidationError[] = []
  for (const [key, fieldSchema] of Object.entries(schema)) {
    errors.push(...validateField(obj[key], fieldSchema, `${prefix}.${key}`, fromString))
  }
  return errors
}

// ─── Public middleware ────────────────────────────────────────────────────────

/**
 * Request validation middleware.
 *
 * Validates body, query, and/or params against a declared schema.
 * On failure: returns 422 with field-level errors, elevates entropy slightly,
 * and emits a security event (repeated failures from the same IP score higher).
 *
 * ```ts
 * app.post('/users', validate({
 *   body: {
 *     name:  { type: 'string', required: true, max: 100 },
 *     email: { type: 'string', required: true, pattern: /^[^@]+@[^@]+$/ },
 *     age:   { type: 'number', min: 0, max: 150 },
 *   },
 *   query: {
 *     dry: { type: 'boolean' },
 *   },
 * }), handler)
 * ```
 */
export function validate(options: ValidateOptions): Middleware {
  return async (ctx: KairoContext, next: () => Promise<void>) => {
    const errors: ValidationError[] = []

    if (options.body)   errors.push(...validateObject(ctx.body,   options.body,   'body',   false))
    if (options.query)  errors.push(...validateObject(ctx.query,  options.query,  'query',  true))
    if (options.params) errors.push(...validateObject(ctx.params, options.params, 'params', true))

    if (errors.length > 0) {
      // Mild entropy bump — validation failures can be legitimate user errors,
      // but repeated ones from the same IP compound through the membrane's IP tracker.
      ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.1, 1.0)
      emitSecurityEvent(ctx, {
        type: 'taint_neutralized',
        route: ctx.path,
        detail: `Validation blocked ${errors.length} field(s): ${errors.map(e => e.field).join(', ')}`,
      })
      ctx.json({ error: 'Validation failed', errors }, 422)
      return
    }

    await next()
  }
}
