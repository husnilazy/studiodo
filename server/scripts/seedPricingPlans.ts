// CLI: create / refresh the three public pricing plans (Starter, Pro, Business).
//
// Usage:
//   node ./node_modules/tsx/dist/cli.mjs server/scripts/seedPricingPlans.ts              # dry run: only prints what would change
//   node ./node_modules/tsx/dist/cli.mjs server/scripts/seedPricingPlans.ts --apply      # write it
//   ... --apply --overwrite                                                              # ALSO overwrite price / kiosk limit / feature gates of plans that already exist
//
// The prices and limits below are a PROPOSAL — adjust them here or later in Superadmin → Plans. By default an existing
// plan only gets its marketing fields refreshed (description, highlight, bullets, discounts, order), because lowering
// the kiosk limit of a plan tenants are already on (the live "starter" plan has no limit) would lock their extra kiosks.
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { client, db } from "../db/client.js";
import { plans, tenants } from "../db/schema.js";

const PROPOSAL = [
  {
    slug: "starter", name: "Starter", price: "150000", kioskLimit: 1, screenBuilderEnabled: false, gifVideoEnabled: false, sortOrder: 1,
    description: "Untuk mulai berjualan dengan satu booth.", featured: false, features: ["Dukungan lewat email"],
    discountPercent: 0, discountLabel: null, discountEndsAt: null, yearlyDiscountPercent: 20,
  },
  {
    slug: "pro", name: "Pro", price: "350000", kioskLimit: 3, screenBuilderEnabled: true, gifVideoEnabled: true, sortOrder: 2,
    description: "Untuk studio dengan beberapa booth aktif.", featured: true, features: ["Dukungan prioritas via WhatsApp"],
    discountPercent: 0, discountLabel: null, discountEndsAt: null, yearlyDiscountPercent: 20,
  },
  {
    slug: "business", name: "Business", price: "750000", kioskLimit: 10, screenBuilderEnabled: true, gifVideoEnabled: true, sortOrder: 3,
    description: "Untuk jaringan booth yang terus bertambah.", featured: false, features: ["Dukungan prioritas via WhatsApp", "Pendampingan instalasi dan pelatihan crew"],
    discountPercent: 0, discountLabel: null, discountEndsAt: null, yearlyDiscountPercent: 20,
  },
] as const;

const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");

async function main() {
  console.log(apply ? "MODE: APPLY\n" : "MODE: dry run (add --apply to write)\n");
  for (const proposed of PROPOSAL) {
    const [existing] = await db.select().from(plans).where(eq(plans.slug, proposed.slug));
    const marketing = {
      description: proposed.description, featured: proposed.featured, features: [...proposed.features], sortOrder: proposed.sortOrder,
      discountPercent: proposed.discountPercent, discountLabel: proposed.discountLabel, discountEndsAt: proposed.discountEndsAt, yearlyDiscountPercent: proposed.yearlyDiscountPercent,
    };
    if (!existing) {
      console.log(`+ ${proposed.slug}: NEW  Rp${proposed.price}/bln, ${proposed.kioskLimit} kiosk`);
      if (apply) await db.insert(plans).values({ ...marketing, slug: proposed.slug, name: proposed.name, price: proposed.price, billingInterval: "monthly", kioskLimit: proposed.kioskLimit, screenBuilderEnabled: proposed.screenBuilderEnabled, gifVideoEnabled: proposed.gifVideoEnabled, active: true });
      continue;
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tenants).where(eq(tenants.plan, existing.slug));
    const limitChanges = existing.kioskLimit !== proposed.kioskLimit;
    console.log(`~ ${proposed.slug}: exists (${count} tenant). marketing fields refreshed.`);
    if (limitChanges || existing.price !== proposed.price) {
      console.log(`    price ${existing.price} -> ${proposed.price}, kiosk limit ${existing.kioskLimit ?? "unlimited"} -> ${proposed.kioskLimit}  ${overwrite ? "(will be OVERWRITTEN)" : "(left as is; pass --overwrite to change)"}`);
    }
    if (apply) {
      const hard = overwrite
        ? { name: proposed.name, price: proposed.price, kioskLimit: proposed.kioskLimit, screenBuilderEnabled: proposed.screenBuilderEnabled, gifVideoEnabled: proposed.gifVideoEnabled }
        : {};
      await db.update(plans).set({ ...marketing, ...hard }).where(eq(plans.id, existing.id));
    }
  }
  console.log(apply ? "\nDone." : "\nNothing written.");
  await client.end();
}

main().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
