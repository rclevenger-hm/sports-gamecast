import { MAX_VERIFICATION_AGE_DAYS, validateSourceVerification } from "./broadcast-source-policy.mjs";

function assert(name, condition, extra) {
  if (!condition) throw new Error(`${name}${extra ? `: ${extra}` : ""}`);
  console.log("ok:", name);
}

const now = Date.parse("2026-09-02T12:00:00Z");
const base = {
  id: "demo-source",
  verifiedAt: "2026-08-15T12:00:00Z",
  verificationUrl: "https://example.com/broadcast-info"
};

assert("fresh verified source passes", validateSourceVerification(base, now).length === 0);

const missingTime = validateSourceVerification({ ...base, verifiedAt: "" }, now);
assert("missing verifiedAt fails", missingTime.some(e => e.includes("verifiedAt")), missingTime.join("; "));

const stale = validateSourceVerification({ ...base, verifiedAt: "2026-01-01T00:00:00Z" }, now);
assert("stale verification fails", stale.some(e => e.includes("stale")), stale.join("; "));

const future = validateSourceVerification({ ...base, verifiedAt: "2026-09-03T00:00:00Z" }, now);
assert("future verification fails", future.some(e => e.includes("future")), future.join("; "));

const missingUrl = validateSourceVerification({ ...base, verificationUrl: "" }, now);
assert("missing verificationUrl fails", missingUrl.some(e => e.includes("verificationUrl")), missingUrl.join("; "));

const insecureUrl = validateSourceVerification({ ...base, verificationUrl: "http://example.com/info" }, now);
assert("non-https verificationUrl fails", insecureUrl.some(e => e.includes("https")), insecureUrl.join("; "));

assert("policy age is explicit", MAX_VERIFICATION_AGE_DAYS === 90);
console.log("Broadcast source verification policy tests passed.");
