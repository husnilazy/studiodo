import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";

export interface FrameCategory {
  key: string;
  label: string;
}

// The starting set an existing tenant already has frames tagged with — kept
// as data here (not a hardcoded type union) so an admin can add their own
// categories (e.g. "Graduation", "Prewedding") without a code change, and
// PilihFrame.tsx reads this same list to group + label the kiosk's category
// picker consistently with whatever the admin actually created.
const DEFAULT_CATEGORIES: FrameCategory[] = [
  { key: "minimal", label: "Minimal" },
  { key: "wedding", label: "Wedding" },
  { key: "birthday", label: "Birthday" },
  { key: "corporate", label: "Corporate" },
  { key: "seasonal", label: "Seasonal" },
  { key: "custom", label: "Custom" },
];

function slugify(label: string) {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug || `kategori-${Date.now().toString(36)}`;
}

interface FrameCategoryStore {
  categories: FrameCategory[];
  addCategory: (label: string) => FrameCategory;
  setCategories: (categories: FrameCategory[]) => void;
}

export const useFrameCategories = create<FrameCategoryStore>()(
  persist(
    (set, get) => ({
      categories: DEFAULT_CATEGORIES,
      addCategory: (label) => {
        const trimmed = label.trim();
        const key = slugify(trimmed);
        const existing = get().categories.find((category) => category.key === key);
        if (existing) return existing;
        const next: FrameCategory = { key, label: trimmed || key };
        set((state) => ({ categories: [...state.categories, next] }));
        // Fire-and-forget: this used to only ever write to THIS browser's
        // localStorage, so a category made on the admin's machine never
        // existed on a separate kiosk device — frames tagged with it fell
        // back to "Custom" there. The local add above stays instant/optimistic;
        // this reconciles with the tenant-wide server copy (and resolves the
        // rare case where two admins pick the same slug at once).
        api.addFrameCategory(trimmed).then((result) => {
          if (result?.categories) get().setCategories(result.categories);
        }).catch((error) => console.error("Gagal menyimpan kategori ke server", error));
        return next;
      },
      // Replaces the list wholesale. Only safe when the caller already knows
      // nothing local-only would be lost — see hydrateFrameCategoriesFromServer
      // below for the safe way to reconcile with the server's copy.
      setCategories: (categories) => set({ categories }),
    }),
    { name: "studiodo-frame-categories" },
  ),
);

// Reconciles this device's category list with the tenant-wide server copy.
// NOT a blind overwrite: a category added while the server was unreachable
// (e.g. right before a deploy) stays local-only until this runs, and a naive
// setCategories(serverList) would silently erase it the next time this page
// loads — confirmed live: an admin added a category, the server hadn't been
// restarted yet so the background push in addCategory failed, and the next
// page load's hydration wiped it from the list entirely. This keeps any
// local-only category visible and retries pushing it to the server.
export async function hydrateFrameCategoriesFromServer() {
  const result = await api.getFrameCategories().catch((error) => {
    console.error("Gagal memuat kategori frame dari server", error);
    return null;
  });
  if (!result?.categories) return;

  const local = useFrameCategories.getState().categories;
  const serverKeys = new Set(result.categories.map((category) => category.key));
  const localOnly = local.filter((category) => !serverKeys.has(category.key));

  let merged = result.categories;
  for (const category of localOnly) {
    try {
      const pushed = await api.addFrameCategory(category.label);
      if (pushed?.categories) merged = pushed.categories;
    } catch (error) {
      console.error("Gagal sinkronkan kategori lokal ke server", category.label, error);
      if (!merged.some((existing) => existing.key === category.key)) merged = [...merged, category];
    }
  }
  useFrameCategories.getState().setCategories(merged);
}
