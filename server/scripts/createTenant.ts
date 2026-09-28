// CLI: onboard a new tenant (photobooth business) onto the shared cloud backend.
// Stand-in for a real signup flow until one exists.
//
// Usage:
//   npm run tenant:create -- --name "Studio X" --slug studio-x --email owner@studiox.com --password secret123
import "dotenv/config";
import crypto from "node:crypto";
import { client, db } from "../db/client.js";
import { admins, kioskKeys, packages, platformSettings, tenantSettings, tenants, templates } from "../db/schema.js";
import { hashPassword } from "../lib/passwordHash.js";

async function getDefaultTrialDays(): Promise<number> {
  const [settings] = await db.select({ defaultTrialDays: platformSettings.defaultTrialDays }).from(platformSettings).limit(1);
  return settings?.defaultTrialDays ?? 7;
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
    args[key] = value;
  }
  return args;
}

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function seedBuiltinPackages(tenantId: string) {
  await db.insert(packages).values([
    { tenantId, name: "Basic Session", price: "50000", photoCount: 3, hasGif: false, hasVideo: false, extraPrints: [], active: true, sortOrder: 1 },
    { tenantId, name: "Premium Session", price: "85000", photoCount: 5, hasGif: true, hasVideo: false, extraPrints: [], active: true, sortOrder: 2 },
    { tenantId, name: "Event Special", price: "0", photoCount: 6, hasGif: true, hasVideo: true, extraPrints: [], active: true, sortOrder: 3 },
  ]);
}

async function seedBuiltinFrames(tenantId: string) {
  const builtins = [
    {
      name: "Classic Portrait",
      frameImageUrl: svgToDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
          <rect width="1200" height="1800" fill="#f5f1e8"/>
          <rect x="120" y="120" width="960" height="1560" rx="28" fill="#f8f5f0" stroke="#3a2d2d" stroke-width="10"/>
          <rect x="220" y="260" width="760" height="480" rx="20" fill="#e9e2d7" stroke="#3a2d2d" stroke-width="6"/>
          <rect x="220" y="1060" width="760" height="340" rx="20" fill="#f4ede5" stroke="#3a2d2d" stroke-width="6"/>
          <path d="M220 760H980" stroke="#3a2d2d" stroke-width="8"/>
          <path d="M600 260V740" stroke="#3a2d2d" stroke-width="8"/>
        </svg>
      `),
      slots: [
        { x: 0.18, y: 0.22, w: 0.28, h: 0.32 },
        { x: 0.54, y: 0.22, w: 0.28, h: 0.32 },
        { x: 0.18, y: 0.58, w: 0.28, h: 0.32 },
      ],
      canvasWidth: 1200,
      canvasHeight: 1800,
      orientation: "portrait",
      category: "custom",
      style: "Classic",
      outputPreset: "4r",
    },
    {
      name: "Moment",
      frameImageUrl: svgToDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
          <rect width="1200" height="1800" fill="#26181e"/>
          <rect x="120" y="130" width="960" height="1540" rx="28" fill="#3a2430" stroke="#f4d2a0" stroke-width="10"/>
          <g stroke="#f4d2a0" stroke-width="7" fill="none">
            <rect x="195" y="230" width="810" height="580" rx="18"/>
            <rect x="195" y="980" width="810" height="440" rx="18"/>
          </g>
          <path d="M195 820H1005M600 230V810M600 980V1420" stroke="#f4d2a0" stroke-width="7"/>
        </svg>
      `),
      slots: [
        { x: 0.18, y: 0.18, w: 0.28, h: 0.28 },
        { x: 0.54, y: 0.18, w: 0.28, h: 0.28 },
        { x: 0.36, y: 0.58, w: 0.28, h: 0.28 },
      ],
      canvasWidth: 1200,
      canvasHeight: 1800,
      orientation: "portrait",
      category: "custom",
      style: "Moment",
      outputPreset: "4r",
    },
    {
      name: "Retro Color",
      frameImageUrl: svgToDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
          <rect width="1200" height="1800" fill="#e3f0ff"/>
          <rect x="110" y="110" width="980" height="1580" rx="24" fill="#fefefe" stroke="#1d3c6f" stroke-width="8"/>
          <rect x="175" y="180" width="850" height="540" rx="18" fill="#f8f5ef" stroke="#1d3c6f" stroke-width="6"/>
          <rect x="175" y="980" width="850" height="500" rx="18" fill="#edf2ff" stroke="#1d3c6f" stroke-width="6"/>
          <g fill="#1d3c6f" font-size="48" font-family="Arial" text-anchor="middle">
            <text x="600" y="240">RETRO</text>
          </g>
        </svg>
      `),
      slots: [
        { x: 0.18, y: 0.18, w: 0.28, h: 0.26 },
        { x: 0.54, y: 0.18, w: 0.28, h: 0.26 },
        { x: 0.36, y: 0.66, w: 0.28, h: 0.26 },
      ],
      canvasWidth: 1200,
      canvasHeight: 1800,
      orientation: "portrait",
      category: "custom",
      style: "Retro",
      outputPreset: "4r",
    },
  ];

  await db.insert(templates).values(builtins.map((builtin) => ({ tenantId, ...builtin })));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.name?.trim();
  const slug = args.slug?.trim().toLowerCase();
  const email = args.email?.trim().toLowerCase();
  const password = args.password ?? "";

  if (!name || !slug || !email || password.length < 6) {
    console.error(
      "Usage: npm run tenant:create -- --name \"Studio X\" --slug studio-x --email owner@studiox.com --password secret123\n" +
      "(password minimal 6 karakter)"
    );
    process.exitCode = 1;
    return;
  }

  const trialDays = await getDefaultTrialDays();
  const subscriptionEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  const [tenant] = await db.insert(tenants).values({
    name,
    slug,
    subscriptionEndsAt,
    // Same optional business-profile fields the superadmin dashboard's "Buat
    // tenant" form and the public application form capture — all optional
    // here too, so existing scripted usage keeps working unchanged.
    ownerName: args.ownerName?.trim() || null,
    ownerWhatsapp: args.ownerWhatsapp?.trim() || null,
    businessType: args.businessType?.trim() || null,
    city: args.city?.trim() || null,
    address: args.address?.trim() || null,
    website: args.website?.trim() || null,
    instagramHandle: args.instagramHandle?.trim() || null,
    referralSource: args.referralSource?.trim() || null,
  }).returning();
  await db.insert(admins).values({ tenantId: tenant.id, email, passwordHash: hashPassword(password) });
  await db.insert(tenantSettings).values({ tenantId: tenant.id, brandName: name });
  await seedBuiltinPackages(tenant.id);
  await seedBuiltinFrames(tenant.id);

  const rawKioskKey = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKioskKey).digest("hex");
  await db.insert(kioskKeys).values({ tenantId: tenant.id, label: "Default kiosk", keyHash, rawKey: rawKioskKey });

  console.log("\nTenant berhasil dibuat.");
  console.log(`  Tenant ID     : ${tenant.id}`);
  console.log(`  Slug          : ${tenant.slug}`);
  console.log(`  Admin email   : ${email}`);
  console.log(`  Kiosk API key : ${rawKioskKey}`);
  console.log(`  Trial sampai  : ${subscriptionEndsAt.toISOString()} (${trialDays} hari)`);
  console.log("\nSimpan kiosk API key di atas — tidak akan ditampilkan lagi. Tempel ke layar");
  console.log("\"Setup / Pair kiosk ini\" di aplikasi Electron untuk menghubungkan kiosk ke tenant ini.\n");
}

main()
  .catch((error) => {
    console.error("Gagal membuat tenant:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
