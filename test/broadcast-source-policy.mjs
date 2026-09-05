export const MAX_VERIFICATION_AGE_DAYS = 90;

export function parseVerifiedAt(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function validateSourceVerification(source, now = Date.now()) {
  const errors = [];
  const id = source && source.id ? source.id : "<unknown>";
  const verifiedAt = parseVerifiedAt(source && source.verifiedAt);

  if (verifiedAt == null) {
    errors.push(`source ${id} requires a valid verifiedAt timestamp`);
  } else {
    if (verifiedAt > now + 5 * 60 * 1000) {
      errors.push(`source ${id} verifiedAt cannot be in the future`);
    }
    const ageMs = Math.max(0, now - verifiedAt);
    const maxAgeMs = MAX_VERIFICATION_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      errors.push(`source ${id} verification is stale (older than ${MAX_VERIFICATION_AGE_DAYS} days)`);
    }
  }

  if (typeof source?.verificationUrl !== "string" || !source.verificationUrl.trim()) {
    errors.push(`source ${id} requires verificationUrl provenance`);
  } else {
    try {
      if (new URL(source.verificationUrl).protocol !== "https:") {
        errors.push(`source ${id} verificationUrl must use https`);
      }
    } catch {
      errors.push(`source ${id} verificationUrl must be a valid URL`);
    }
  }

  return errors;
}
