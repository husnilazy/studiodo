/** Where a tenant manages and pays for its booths — the website's tenant portal. */
export function portalBaseUrl(): string {
  return (process.env.PORTAL_BASE_URL || "https://www.studiodo.id").replace(/\/$/, "");
}

/**
 * The address of the pages STUDIODO sends to people by link: the cooperation letter, the onboarding guide, the sign-in
 * confirmation and the WhatsApp webhook. APP_BASE_URL (e.g. https://app.studiodo.id) keeps them off the photo-download
 * domain; without it they fall back to PUBLIC_BASE_URL (what qr. is for) and finally the website.
 */
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || portalBaseUrl()).replace(/\/$/, "");
}
