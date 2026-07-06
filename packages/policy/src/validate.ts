export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// Minimal deterministic JSON-schema validator covering the subset used by the
// tool catalog: object schemas with typed properties, required lists, arrays,
// and additionalProperties:false. Narrow schemas + server-side validation are
// an injection mitigation (Spec §7.2) — model output never reaches a
// connector unvalidated.
export function validateToolArgs(
  schema: Record<string, unknown>,
  args: unknown,
): ValidationResult {
  const errors: string[] = [];
  validateValue(schema, args, "$", errors);
  return { ok: errors.length === 0, errors };
}

function validateValue(
  schema: Record<string, unknown>,
  value: unknown,
  path: string,
  errors: string[],
) {
  const type = schema.type as string | undefined;
  if (type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(`${path}: expected object`);
      return;
    }
    const props = (schema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const required = (schema.required ?? []) as string[];
    const obj = value as Record<string, unknown>;
    for (const key of required) {
      if (obj[key] === undefined) errors.push(`${path}.${key}: required`);
    }
    for (const [key, v] of Object.entries(obj)) {
      const propSchema = props[key];
      if (!propSchema) {
        if (schema.additionalProperties === false) {
          errors.push(`${path}.${key}: unexpected property`);
        }
        continue;
      }
      if (v !== undefined) validateValue(propSchema, v, `${path}.${key}`, errors);
    }
    return;
  }
  if (type === "string") {
    if (typeof value !== "string") errors.push(`${path}: expected string`);
    return;
  }
  if (type === "number") {
    if (typeof value !== "number" || Number.isNaN(value))
      errors.push(`${path}: expected number`);
    return;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${path}: expected boolean`);
    return;
  }
  if (type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array`);
      return;
    }
    const items = schema.items as Record<string, unknown> | undefined;
    if (items) {
      value.forEach((item, i) =>
        validateValue(items, item, `${path}[${i}]`, errors),
      );
    }
    return;
  }
  // No type constraint: accept.
}
