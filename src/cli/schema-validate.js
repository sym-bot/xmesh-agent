'use strict';

// Minimal JSON-Schema validator covering the subset of Draft 2020-12 that the
// agent.toml schema actually uses: additionalProperties:false, required,
// type, enum, minLength, minimum. No new dependency.

function validate(value, schema, pathStack = []) {
  const errors = [];
  const here = () => (pathStack.length === 0 ? '<root>' : pathStack.join('.'));
  const push = (msg) => errors.push(`${here()}: ${msg}`);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      push(`expected ${types.join(' or ')}, got ${describe(value)}`);
      return errors;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    push(`expected one of [${schema.enum.join(', ')}], got ${JSON.stringify(value)}`);
  }

  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    push(`expected >= ${schema.minimum}, got ${value}`);
  }
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) {
    push(`expected length >= ${schema.minLength}, got ${value.length}`);
  }

  if (schema.type === 'object' || (schema.properties && typeof value === 'object' && value !== null && !Array.isArray(value))) {
    if (Array.isArray(schema.required)) {
      for (const k of schema.required) {
        if (!(k in value)) push(`missing required property: ${k}`);
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const k of Object.keys(value)) {
        if (!allowed.has(k)) {
          push(`unknown property: ${k} (allowed: ${[...allowed].join(', ')})`);
        }
      }
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries(schema.properties)) {
        if (k in value) {
          errors.push(...validate(value[k], sub, [...pathStack, k]));
        }
      }
    }
  }

  return errors;
}

function matchesType(value, t) {
  if (t === 'null') return value === null;
  if (t === 'string') return typeof value === 'string';
  if (t === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (t === 'number') return typeof value === 'number';
  if (t === 'boolean') return typeof value === 'boolean';
  if (t === 'array') return Array.isArray(value);
  if (t === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return false;
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

module.exports = { validate };
