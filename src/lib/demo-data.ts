/**
 * ⚠️ DEMO-ONLY placeholder catalog — for visual development of the storefront.
 *
 * No real products, no real store, no brand. These values exist so the UI can be
 * designed and reviewed before a client's Supabase project is connected.
 *
 * WHEN A SUPABASE PROJECT IS CONNECTED the data layer (src/lib/data.ts) serves
 * real rows instead, and this module is no longer read. It is never merged with
 * database data — the two sources are strictly separated in data.ts.
 *
 * STEP 2 additions, all mirroring real DB behaviour so every public path is
 * testable in demo mode:
 *   • `status` on categories and products — inactive rows never appear publicly.
 *   • `created_at` on products — drives the "newest" sort.
 *   • An INACTIVE category («حراج») holding one ACTIVE product («شال ابریشمی»):
 *     that product must not appear anywhere public, and its slug page must show
 *     the not-found state (active product inside an inactive category is hidden).
 *   • One INACTIVE product («شلوارک کتان») — hidden everywhere too.
 * Visible count stays at 8 so the shop grid doesn't balloon.
 *
 * STEP 3 additions — variants + inventory (mirrors public.variants in
 * supabase/migrations/0003_variants.sql):
 *   • Every product carries `variants`: one row per colour + size combination,
 *     each with its own SKU and its own stock quantity. Stock exists ONLY here —
 *     never at product level — exactly like the database.
 *   • Realistic variety across the 8 visible products: 2–3 colours, sizes S–XL,
 *     individual zero-stock sizes, and colour(s) whose whole size run is at 0
 *     (drives the «این رنگ موجود نیست» state).
 *   • One INACTIVE variant (سویشرت یقه گرد / سبز / L) — it must never reach the
 *     UI, mirroring the `status` filtering the real queries perform.
 *   • Persian colour names as plain text; latin uppercase SKUs.
 *   • The hidden fixtures may carry variants too, but stay hidden.
 *   • `stockQuantity` never goes below 0 — the DB enforces the same CHECK.
 */

export interface DemoCategory {
  id: string;
  name: string;
  slug: string;
  image: string;
  description: string;
  status: "active" | "inactive"; // mirrors products.status filtering (queries, not migration)
}

/**
 * One colour/size combination of a demo product (mirrors public.variants with
 * camelCase columns). `productId` is intentionally absent — the owning product
 * row supplies it (see src/lib/data.ts → toDemoProduct).
 */
export interface DemoVariant {
  id: string;
  color: string;
  size: string;
  sku: string;
  stockQuantity: number; // >= 0, enforced by CHECK in the migration
  status: "active" | "inactive";
}

export interface DemoProduct {
  id: string;
  title: string;
  slug: string;
  description: string;
  base_price: number; // toman
  discount_price: number | null; // toman; null = no discount
  category: string; // display name of the category
  status: "active" | "inactive"; // mirrors products.status filtering (queries, not migration)
  created_at: string; // ISO — sorts the "newest" mode (created_at desc)
  image: string; // primary placeholder artwork (public/images)
  /** Gallery shots (placeholder variants of the same artwork). */
  images: string[];
  /** Colour + size combinations with their own SKU and stock (STEP 3). */
  variants: DemoVariant[];
}

export const DEMO_CATEGORIES: DemoCategory[] = [
  {
    id: "cat-men",
    name: "مردانه",
    slug: "men",
    image: "/images/cat-men.svg",
    description: "پوشاک کلاسیک و روزمره برای آقایان",
    status: "active",
  },
  {
    id: "cat-women",
    name: "زنانه",
    slug: "women",
    image: "/images/cat-women.svg",
    description: "انتخابی مینیمال و شیک برای بانوان",
    status: "active",
  },
  {
    id: "cat-kids",
    name: "بچه‌گانه",
    slug: "kids",
    image: "/images/cat-kids.svg",
    description: "راحتی و دوام برای کوچک‌ترها",
    status: "active",
  },
  {
    id: "cat-accessories",
    name: "اکسسوری",
    slug: "accessories",
    image: "/images/cat-accessories.svg",
    description: "تکمیل‌کننده استایل روزمره",
    status: "active",
  },
  {
    // INACTIVE category — its products must never appear publicly even if the
    // product row itself is active (see p-silk-scarf below).
    id: "cat-clearance",
    name: "حراج",
    slug: "clearance",
    image: "/images/cat-clearance.svg",
    description: "پیشنهادهای ویژه با تخفیف",
    status: "inactive",
  },
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "p-classic-tee",
    title: "تی‌شرت کلاسیک",
    slug: "classic-tee",
    description: "تی‌شرت نخی ساده با برش راحت؛ انتخاب اول برای استایل روزمره.",
    base_price: 320_000,
    discount_price: 269_000,
    category: "مردانه",
    status: "active",
    created_at: "2025-03-01T00:00:00Z",
    image: "/images/product-tshirt.svg",
    images: [
      "/images/product-tshirt.svg",
      "/images/product-tshirt-2.svg",
      "/images/product-tshirt-3.svg",
    ],
    // Reference variant set from the STEP 3 spec: مشکی L is deliberately 0 —
    // the out-of-stock test case (ناموجود + disabled purchase).
    variants: [
      { id: "v-tee-blk-s", color: "مشکی", size: "S", sku: "TS-BLK-S", stockQuantity: 5, status: "active" },
      { id: "v-tee-blk-m", color: "مشکی", size: "M", sku: "TS-BLK-M", stockQuantity: 8, status: "active" },
      { id: "v-tee-blk-l", color: "مشکی", size: "L", sku: "TS-BLK-L", stockQuantity: 0, status: "active" },
      { id: "v-tee-wht-s", color: "سفید", size: "S", sku: "TS-WHT-S", stockQuantity: 2, status: "active" },
      { id: "v-tee-wht-m", color: "سفید", size: "M", sku: "TS-WHT-M", stockQuantity: 4, status: "active" },
      { id: "v-tee-wht-l", color: "سفید", size: "L", sku: "TS-WHT-L", stockQuantity: 6, status: "active" },
    ],
  },
  {
    id: "p-collared-shirt",
    title: "پیراهن مردانه یقه‌دار",
    slug: "collared-shirt",
    description: "پیراهن رسمی با پارچه خوش‌فرم؛ مناسب محل کار و قرارهای مهم.",
    base_price: 540_000,
    discount_price: null,
    category: "مردانه",
    status: "active",
    created_at: "2025-04-15T00:00:00Z",
    image: "/images/product-shirt.svg",
    images: [
      "/images/product-shirt.svg",
      "/images/product-shirt-2.svg",
      "/images/product-shirt-3.svg",
    ],
    // چهار سایز در هر رنگ؛ سرمه‌ای M و سفید XL ناموجود.
    variants: [
      { id: "v-shirt-nvy-s", color: "سرمه‌ای", size: "S", sku: "CS-NVY-S", stockQuantity: 3, status: "active" },
      { id: "v-shirt-nvy-m", color: "سرمه‌ای", size: "M", sku: "CS-NVY-M", stockQuantity: 0, status: "active" },
      { id: "v-shirt-nvy-l", color: "سرمه‌ای", size: "L", sku: "CS-NVY-L", stockQuantity: 4, status: "active" },
      { id: "v-shirt-nvy-xl", color: "سرمه‌ای", size: "XL", sku: "CS-NVY-XL", stockQuantity: 2, status: "active" },
      { id: "v-shirt-wht-s", color: "سفید", size: "S", sku: "CS-WHT-S", stockQuantity: 1, status: "active" },
      { id: "v-shirt-wht-m", color: "سفید", size: "M", sku: "CS-WHT-M", stockQuantity: 6, status: "active" },
      { id: "v-shirt-wht-l", color: "سفید", size: "L", sku: "CS-WHT-L", stockQuantity: 3, status: "active" },
      { id: "v-shirt-wht-xl", color: "سفید", size: "XL", sku: "CS-WHT-XL", stockQuantity: 0, status: "active" },
    ],
  },
  {
    id: "p-straight-jeans",
    title: "شلوار جین راسته",
    slug: "straight-jeans",
    description: "جین راسته با رنگ ثابت و دوخت مقاوم؛ همیشه در استایل.",
    base_price: 890_000,
    discount_price: 749_000,
    category: "مردانه",
    status: "active",
    created_at: "2025-06-02T00:00:00Z",
    image: "/images/product-jeans.svg",
    images: [
      "/images/product-jeans.svg",
      "/images/product-jeans-2.svg",
      "/images/product-jeans-3.svg",
    ],
    // سه رنگ؛ در هر رنگ یک سایز ناموجود.
    variants: [
      { id: "v-jeans-blu-s", color: "آبی", size: "S", sku: "SJ-BLU-S", stockQuantity: 0, status: "active" },
      { id: "v-jeans-blu-m", color: "آبی", size: "M", sku: "SJ-BLU-M", stockQuantity: 5, status: "active" },
      { id: "v-jeans-blu-l", color: "آبی", size: "L", sku: "SJ-BLU-L", stockQuantity: 7, status: "active" },
      { id: "v-jeans-blk-s", color: "مشکی", size: "S", sku: "SJ-BLK-S", stockQuantity: 4, status: "active" },
      { id: "v-jeans-blk-m", color: "مشکی", size: "M", sku: "SJ-BLK-M", stockQuantity: 0, status: "active" },
      { id: "v-jeans-blk-l", color: "مشکی", size: "L", sku: "SJ-BLK-L", stockQuantity: 6, status: "active" },
      { id: "v-jeans-lbl-s", color: "آبی روشن", size: "S", sku: "SJ-LBL-S", stockQuantity: 2, status: "active" },
      { id: "v-jeans-lbl-m", color: "آبی روشن", size: "M", sku: "SJ-LBL-M", stockQuantity: 3, status: "active" },
      { id: "v-jeans-lbl-l", color: "آبی روشن", size: "L", sku: "SJ-LBL-L", stockQuantity: 0, status: "active" },
    ],
  },
  {
    id: "p-winter-coat",
    title: "پالتوی زمستانه",
    slug: "winter-coat",
    description: "پالتوی بلند و گرم با طراحی مینیمال؛ همراه مطمئن روزهای سرد.",
    base_price: 2_450_000,
    discount_price: 1_890_000,
    category: "زنانه",
    status: "active",
    created_at: "2025-07-20T00:00:00Z",
    image: "/images/product-coat.svg",
    images: [
      "/images/product-coat.svg",
      "/images/product-coat-2.svg",
      "/images/product-coat-3.svg",
    ],
    // «زغالی» در هیچ سایزی موجود نیست → رنگ کاملاً ناموجود («این رنگ موجود نیست»).
    variants: [
      { id: "v-coat-blk-s", color: "مشکی", size: "S", sku: "WC-BLK-S", stockQuantity: 2, status: "active" },
      { id: "v-coat-blk-m", color: "مشکی", size: "M", sku: "WC-BLK-M", stockQuantity: 3, status: "active" },
      { id: "v-coat-blk-l", color: "مشکی", size: "L", sku: "WC-BLK-L", stockQuantity: 1, status: "active" },
      { id: "v-coat-blk-xl", color: "مشکی", size: "XL", sku: "WC-BLK-XL", stockQuantity: 2, status: "active" },
      { id: "v-coat-chr-s", color: "زغالی", size: "S", sku: "WC-CHR-S", stockQuantity: 0, status: "active" },
      { id: "v-coat-chr-m", color: "زغالی", size: "M", sku: "WC-CHR-M", stockQuantity: 0, status: "active" },
      { id: "v-coat-chr-l", color: "زغالی", size: "L", sku: "WC-CHR-L", stockQuantity: 0, status: "active" },
      { id: "v-coat-chr-xl", color: "زغالی", size: "XL", sku: "WC-CHR-XL", stockQuantity: 0, status: "active" },
    ],
  },
  {
    id: "p-simple-dress",
    title: "لباس ساده مجلسی",
    slug: "simple-dress",
    description: "برش تمیز و سیلوئت ظریف؛ برای موقعیت‌های خاص.",
    base_price: 1_280_000,
    discount_price: null,
    category: "زنانه",
    status: "active",
    created_at: "2025-08-10T00:00:00Z",
    image: "/images/product-dress.svg",
    images: [
      "/images/product-dress.svg",
      "/images/product-dress-2.svg",
      "/images/product-dress-3.svg",
    ],
    // سه رنگ؛ مشکی فقط سایز M موجود است.
    variants: [
      { id: "v-dress-brg-s", color: "زرشکی", size: "S", sku: "SD-BRG-S", stockQuantity: 1, status: "active" },
      { id: "v-dress-brg-m", color: "زرشکی", size: "M", sku: "SD-BRG-M", stockQuantity: 4, status: "active" },
      { id: "v-dress-brg-l", color: "زرشکی", size: "L", sku: "SD-BRG-L", stockQuantity: 2, status: "active" },
      { id: "v-dress-blk-s", color: "مشکی", size: "S", sku: "SD-BLK-S", stockQuantity: 0, status: "active" },
      { id: "v-dress-blk-m", color: "مشکی", size: "M", sku: "SD-BLK-M", stockQuantity: 3, status: "active" },
      { id: "v-dress-blk-l", color: "مشکی", size: "L", sku: "SD-BLK-L", stockQuantity: 0, status: "active" },
      { id: "v-dress-gld-s", color: "طلایی", size: "S", sku: "SD-GLD-S", stockQuantity: 2, status: "active" },
      { id: "v-dress-gld-m", color: "طلایی", size: "M", sku: "SD-GLD-M", stockQuantity: 0, status: "active" },
      { id: "v-dress-gld-l", color: "طلایی", size: "L", sku: "SD-GLD-L", stockQuantity: 1, status: "active" },
    ],
  },
  {
    id: "p-midi-skirt",
    title: "دامن میدی",
    slug: "midi-skirt",
    description: "دامن میدی با پارچه خنک و سایه‌رنگ خنثی؛ پایه‌ای برای ترکیب‌های مختلف.",
    base_price: 380_000,
    discount_price: 320_000,
    category: "زنانه",
    status: "active",
    created_at: "2025-09-05T00:00:00Z",
    image: "/images/product-skirt.svg",
    images: [
      "/images/product-skirt.svg",
      "/images/product-skirt-2.svg",
      "/images/product-skirt-3.svg",
    ],
    // موجودی کم — نزدیک به پایان (کارت‌ها باید بدون داده جعلی قابل بج‌گذاری باشند).
    variants: [
      { id: "v-skirt-olv-s", color: "زیتونی", size: "S", sku: "MS-OLV-S", stockQuantity: 3, status: "active" },
      { id: "v-skirt-olv-m", color: "زیتونی", size: "M", sku: "MS-OLV-M", stockQuantity: 2, status: "active" },
      { id: "v-skirt-olv-l", color: "زیتونی", size: "L", sku: "MS-OLV-L", stockQuantity: 4, status: "active" },
      { id: "v-skirt-nvy-s", color: "سرمه‌ای", size: "S", sku: "MS-NVY-S", stockQuantity: 0, status: "active" },
      { id: "v-skirt-nvy-m", color: "سرمه‌ای", size: "M", sku: "MS-NVY-M", stockQuantity: 1, status: "active" },
      { id: "v-skirt-nvy-l", color: "سرمه‌ای", size: "L", sku: "MS-NVY-L", stockQuantity: 2, status: "active" },
    ],
  },
  {
    id: "p-cozy-hoodie",
    title: "هودی گرم",
    slug: "cozy-hoodie",
    description: "هودی نرم و راحت با جیب جلو؛ برای استایل‌های غیررسمی.",
    base_price: 540_000,
    discount_price: null,
    category: "بچه‌گانه",
    status: "active",
    created_at: "2025-10-12T00:00:00Z",
    image: "/images/product-hoodie.svg",
    images: [
      "/images/product-hoodie.svg",
      "/images/product-hoodie-2.svg",
      "/images/product-hoodie-3.svg",
    ],
    // خاکستری L ناموجود، بقیه موجود.
    variants: [
      { id: "v-hoodie-nvy-s", color: "سرمه‌ای", size: "S", sku: "HD-NVY-S", stockQuantity: 4, status: "active" },
      { id: "v-hoodie-nvy-m", color: "سرمه‌ای", size: "M", sku: "HD-NVY-M", stockQuantity: 6, status: "active" },
      { id: "v-hoodie-nvy-l", color: "سرمه‌ای", size: "L", sku: "HD-NVY-L", stockQuantity: 2, status: "active" },
      { id: "v-hoodie-gry-s", color: "خاکستری", size: "S", sku: "HD-GRY-S", stockQuantity: 2, status: "active" },
      { id: "v-hoodie-gry-m", color: "خاکستری", size: "M", sku: "HD-GRY-M", stockQuantity: 4, status: "active" },
      { id: "v-hoodie-gry-l", color: "خاکستری", size: "L", sku: "HD-GRY-L", stockQuantity: 0, status: "active" },
    ],
  },
  {
    id: "p-crewneck-sweater",
    title: "سویشرت یقه گرد",
    slug: "crewneck-sweater",
    description: "سویشرت پنبه‌ای با بافت لطیف؛ گرم و سبک برای هر فصل.",
    base_price: 460_000,
    discount_price: 399_000,
    category: "مردانه",
    status: "active",
    created_at: "2025-11-01T00:00:00Z",
    image: "/images/product-sweater.svg",
    images: [
      "/images/product-sweater.svg",
      "/images/product-sweater-2.svg",
      "/images/product-sweater-3.svg",
    ],
    // سبز L عمداً INACTIVE است: هرگز نباید در UI دیده شود (همان فیلتر status در دیتابیس).
    variants: [
      { id: "v-sweater-gry-s", color: "طوسی", size: "S", sku: "SW-GRY-S", stockQuantity: 3, status: "active" },
      { id: "v-sweater-gry-m", color: "طوسی", size: "M", sku: "SW-GRY-M", stockQuantity: 5, status: "active" },
      { id: "v-sweater-gry-l", color: "طوسی", size: "L", sku: "SW-GRY-L", stockQuantity: 0, status: "active" },
      { id: "v-sweater-brg-s", color: "زرشکی", size: "S", sku: "SW-BRG-S", stockQuantity: 0, status: "active" },
      { id: "v-sweater-brg-m", color: "زرشکی", size: "M", sku: "SW-BRG-M", stockQuantity: 2, status: "active" },
      { id: "v-sweater-brg-l", color: "زرشکی", size: "L", sku: "SW-BRG-L", stockQuantity: 4, status: "active" },
      { id: "v-sweater-grn-s", color: "سبز", size: "S", sku: "SW-GRN-S", stockQuantity: 0, status: "active" },
      { id: "v-sweater-grn-m", color: "سبز", size: "M", sku: "SW-GRN-M", stockQuantity: 3, status: "active" },
      { id: "v-sweater-grn-l", color: "سبز", size: "L", sku: "SW-GRN-L", stockQuantity: 6, status: "inactive" },
    ],
  },
  {
    // INACTIVE product — must never appear in lists or resolve on its slug page.
    id: "p-cotton-shorts",
    title: "شلوارک کتان",
    slug: "cotton-shorts",
    description: "شلوارک کتان خنک؛ راحتی برای روزهای گرم.",
    base_price: 280_000,
    discount_price: 240_000,
    category: "مردانه",
    status: "inactive",
    created_at: "2025-11-20T00:00:00Z",
    image: "/images/product-shorts.svg",
    images: [
      "/images/product-shorts.svg",
      "/images/product-shorts-2.svg",
      "/images/product-shorts-3.svg",
    ],
    // Hidden fixture — variants exist so the row mirrors a real store, but the
    // product itself (and therefore these variants) must stay invisible.
    variants: [
      { id: "v-shorts-khk-s", color: "خاکی", size: "S", sku: "SH-KHK-S", stockQuantity: 2, status: "active" },
      { id: "v-shorts-khk-m", color: "خاکی", size: "M", sku: "SH-KHK-M", stockQuantity: 3, status: "active" },
    ],
  },
  {
    // ACTIVE product inside an INACTIVE category — hidden publicly; its slug must
    // show the not-found state, exactly like a real inactive category in Supabase.
    id: "p-silk-scarf",
    title: "شال ابریشمی",
    slug: "silk-scarf",
    description: "شال ابریشمی با طرح مینیمال؛ مناسب استایل رسمی و روزمره.",
    base_price: 420_000,
    discount_price: 360_000,
    category: "حراج",
    status: "active",
    created_at: "2025-12-01T00:00:00Z",
    image: "/images/product-scarf.svg",
    images: [
      "/images/product-scarf.svg",
      "/images/product-scarf-2.svg",
      "/images/product-scarf-3.svg",
    ],
    // Hidden fixture. «فریسایز» is a real-world size label the sorting helper
    // handles (unknown labels sort after S/M/L/XL) — nice that it stays hidden.
    variants: [
      { id: "v-scarf-nvy-fr", color: "سرمه‌ای", size: "فریسایز", sku: "SC-NVY-FR", stockQuantity: 4, status: "active" },
      { id: "v-scarf-gld-fr", color: "طلایی", size: "فریسایز", sku: "SC-GLD-FR", stockQuantity: 0, status: "active" },
    ],
  },
];
