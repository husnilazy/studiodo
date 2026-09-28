// Augment Express's Request with the fields our auth middleware attach —
// requireAdminAuth sets adminId + tenantId, requireKioskAuth sets tenantId +
// kioskKeyId, requireSuperadminAuth sets superadminId only (never tenant-scoped).
declare namespace Express {
  export interface Request {
    tenantId?: string;
    adminId?: string;
    kioskKeyId?: string;
    superadminId?: string;
  }
}
