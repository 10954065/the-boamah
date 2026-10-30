/**
 * Prints the private links for the admin and the till, worked out from
 * STAFF_GATE_KEY. Run it where the key is set, for example on the server:
 *
 *   railway ssh --service the-boamah -- npm run staff:links
 *
 * Super Admins also see them under Admin → Staff. Anyone with a link can reach
 * the sign-in page, so share them only with staff.
 */
import "dotenv/config";
import { posOrigin } from "../src/lib/pos-host";
import { entrySlug, gateKey } from "../src/lib/staff-gate";
import { siteUrl } from "../src/lib/utils";

const key = gateKey();
if (!key) {
  console.error("STAFF_GATE_KEY must be set and at least 32 characters long.");
  process.exit(1);
}
console.info(`Admin: ${siteUrl(`/${entrySlug(key, "admin")}`)}`);
console.info(`Till:  ${posOrigin() || siteUrl()}/${entrySlug(key, "till")}`);
