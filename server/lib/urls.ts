/** Where a tenant manages and pays for its booths — the website's tenant portal. */
export function portalBaseUrl(): string {
  return (process.env.PORTAL_BASE_URL || "https://www.studiodo.id").replace(/\/$/, "");
}
