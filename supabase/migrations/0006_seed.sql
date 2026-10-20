-- ============================================================================
-- 0006_seed.sql — Demo-parity catalog seed for ONE white-label client store.
--
-- Mirrors src/lib/demo-data.ts exactly (same category names/slugs, product
-- slugs, prices, discount prices, image URLs, colour/size SKUs and stock
-- quantities) so a connected Supabase project renders the SAME storefront the
-- demo preview shows — including the deliberate fixture states:
--   • «حراج» category is INACTIVE and holds an ACTIVE product (شال ابریشمی):
--     hidden publicly, exactly like the demo.
--   • «شلوارک کتان» is an INACTIVE product: hidden publicly.
--   • «پالتوی زمستانه» / «زغالی» is sold out in every size (colour-out state).
--   • «سویشرت یقه گرد» / «سبز» / L is an INACTIVE variant (never shown).
--   • Individual zero-stock sizes across the catalog (TS-BLK-L, CS-NVY-M, …).
--
-- Idempotent: every insert targets the schema's own unique keys
-- (categories.slug, products.slug, product_images (product_id, position),
-- variants.sku) with ON CONFLICT DO NOTHING, so re-running is a no-op.
-- Prices are Toman integers stored in numeric columns.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- categories
-- ----------------------------------------------------------------------------
insert into public.categories (name, slug, image, description, status) values
  ('مردانه', 'men', '/images/cat-men.svg', 'پوشاک کلاسیک و روزمره برای آقایان', 'active'),
  ('زنانه', 'women', '/images/cat-women.svg', 'انتخابی مینیمال و شیک برای بانوان', 'active'),
  ('بچه‌گانه', 'kids', '/images/cat-kids.svg', 'راحتی و دوام برای کوچک‌ترها', 'active'),
  ('اکسسوری', 'accessories', '/images/cat-accessories.svg', 'تکمیل‌کننده استایل روزمره', 'active'),
  ('حراج', 'clearance', '/images/cat-clearance.svg', 'پیشنهادهای ویژه با تخفیف', 'inactive')
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- products (category_id resolved by category slug; created_at preserved so the
-- «جدیدترین» sort matches the demo)
-- ----------------------------------------------------------------------------
insert into public.products (title, slug, description, base_price, discount_price, category_id, status, created_at)
select v.title, v.slug, v.description, v.base_price, v.discount_price, c.id, v.status, v.created_at
from (values
  ('تی‌شرت کلاسیک', 'classic-tee', 'تی‌شرت نخی ساده با برش راحت؛ انتخاب اول برای استایل روزمره.', 320000::numeric, 269000, 'men', 'active', '2025-03-01T00:00:00Z'::timestamptz),
  ('پیراهن مردانه یقه‌دار', 'collared-shirt', 'پیراهن رسمی با پارچه خوش‌فرم؛ مناسب محل کار و قرارهای مهم.', 540000::numeric, null::numeric, 'men', 'active', '2025-04-15T00:00:00Z'::timestamptz),
  ('شلوار جین راسته', 'straight-jeans', 'جین راسته با رنگ ثابت و دوخت مقاوم؛ همیشه در استایل.', 890000::numeric, 749000, 'men', 'active', '2025-06-02T00:00:00Z'::timestamptz),
  ('پالتوی زمستانه', 'winter-coat', 'پالتوی بلند و گرم با طراحی مینیمال؛ همراه مطمئن روزهای سرد.', 2450000::numeric, 1890000, 'women', 'active', '2025-07-20T00:00:00Z'::timestamptz),
  ('لباس ساده مجلسی', 'simple-dress', 'برش تمیز و سیلوئت ظریف؛ برای موقعیت‌های خاص.', 1280000::numeric, null::numeric, 'women', 'active', '2025-08-10T00:00:00Z'::timestamptz),
  ('دامن میدی', 'midi-skirt', 'دامن میدی با پارچه خنک و سایه‌رنگ خنثی؛ پایه‌ای برای ترکیب‌های مختلف.', 380000::numeric, 320000, 'women', 'active', '2025-09-05T00:00:00Z'::timestamptz),
  ('هودی گرم', 'cozy-hoodie', 'هودی نرم و راحت با جیب جلو؛ برای استایل‌های غیررسمی.', 540000::numeric, null::numeric, 'kids', 'active', '2025-10-12T00:00:00Z'::timestamptz),
  ('سویشرت یقه گرد', 'crewneck-sweater', 'سویشرت پنبه‌ای با بافت لطیف؛ گرم و سبک برای هر فصل.', 460000::numeric, 399000, 'men', 'active', '2025-11-01T00:00:00Z'::timestamptz),
  ('شلوارک کتان', 'cotton-shorts', 'شلوارک کتان خنک؛ راحتی برای روزهای گرم.', 280000::numeric, 240000, 'men', 'inactive', '2025-11-20T00:00:00Z'::timestamptz),
  ('شال ابریشمی', 'silk-scarf', 'شال ابریشمی با طرح مینیمال؛ مناسب استایل رسمی و روزمره.', 420000::numeric, 360000, 'clearance', 'active', '2025-12-01T00:00:00Z'::timestamptz)
) as v(title, slug, description, base_price, discount_price, category_slug, status, created_at)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- product_images (position 0 = main image used on cards; same order as demo)
-- ----------------------------------------------------------------------------
insert into public.product_images (product_id, url, position)
select p.id, v.url, v.position
from (values
  ('classic-tee', '/images/product-tshirt.svg', 0),
  ('classic-tee', '/images/product-tshirt-2.svg', 1),
  ('classic-tee', '/images/product-tshirt-3.svg', 2),
  ('collared-shirt', '/images/product-shirt.svg', 0),
  ('collared-shirt', '/images/product-shirt-2.svg', 1),
  ('collared-shirt', '/images/product-shirt-3.svg', 2),
  ('straight-jeans', '/images/product-jeans.svg', 0),
  ('straight-jeans', '/images/product-jeans-2.svg', 1),
  ('straight-jeans', '/images/product-jeans-3.svg', 2),
  ('winter-coat', '/images/product-coat.svg', 0),
  ('winter-coat', '/images/product-coat-2.svg', 1),
  ('winter-coat', '/images/product-coat-3.svg', 2),
  ('simple-dress', '/images/product-dress.svg', 0),
  ('simple-dress', '/images/product-dress-2.svg', 1),
  ('simple-dress', '/images/product-dress-3.svg', 2),
  ('midi-skirt', '/images/product-skirt.svg', 0),
  ('midi-skirt', '/images/product-skirt-2.svg', 1),
  ('midi-skirt', '/images/product-skirt-3.svg', 2),
  ('cozy-hoodie', '/images/product-hoodie.svg', 0),
  ('cozy-hoodie', '/images/product-hoodie-2.svg', 1),
  ('cozy-hoodie', '/images/product-hoodie-3.svg', 2),
  ('crewneck-sweater', '/images/product-sweater.svg', 0),
  ('crewneck-sweater', '/images/product-sweater-2.svg', 1),
  ('crewneck-sweater', '/images/product-sweater-3.svg', 2),
  ('cotton-shorts', '/images/product-shorts.svg', 0),
  ('cotton-shorts', '/images/product-shorts-2.svg', 1),
  ('cotton-shorts', '/images/product-shorts-3.svg', 2),
  ('silk-scarf', '/images/product-scarf.svg', 0),
  ('silk-scarf', '/images/product-scarf-2.svg', 1),
  ('silk-scarf', '/images/product-scarf-3.svg', 2)
) as v(product_slug, url, position)
join public.products p on p.slug = v.product_slug
on conflict (product_id, position) do nothing;

-- ----------------------------------------------------------------------------
-- variants — one row per colour + size, each with its own SKU and stock.
-- Stock lives ONLY here (never on products), matching 0003_variants.sql.
-- ----------------------------------------------------------------------------
insert into public.variants (product_id, color, size, sku, stock_quantity, status)
select p.id, v.color, v.size, v.sku, v.stock_quantity, v.status
from (values
  ('classic-tee', 'مشکی', 'S', 'TS-BLK-S', 5, 'active'),
  ('classic-tee', 'مشکی', 'M', 'TS-BLK-M', 8, 'active'),
  ('classic-tee', 'مشکی', 'L', 'TS-BLK-L', 0, 'active'),
  ('classic-tee', 'سفید', 'S', 'TS-WHT-S', 2, 'active'),
  ('classic-tee', 'سفید', 'M', 'TS-WHT-M', 4, 'active'),
  ('classic-tee', 'سفید', 'L', 'TS-WHT-L', 6, 'active'),
  ('collared-shirt', 'سرمه‌ای', 'S', 'CS-NVY-S', 3, 'active'),
  ('collared-shirt', 'سرمه‌ای', 'M', 'CS-NVY-M', 0, 'active'),
  ('collared-shirt', 'سرمه‌ای', 'L', 'CS-NVY-L', 4, 'active'),
  ('collared-shirt', 'سرمه‌ای', 'XL', 'CS-NVY-XL', 2, 'active'),
  ('collared-shirt', 'سفید', 'S', 'CS-WHT-S', 1, 'active'),
  ('collared-shirt', 'سفید', 'M', 'CS-WHT-M', 6, 'active'),
  ('collared-shirt', 'سفید', 'L', 'CS-WHT-L', 3, 'active'),
  ('collared-shirt', 'سفید', 'XL', 'CS-WHT-XL', 0, 'active'),
  ('straight-jeans', 'آبی', 'S', 'SJ-BLU-S', 0, 'active'),
  ('straight-jeans', 'آبی', 'M', 'SJ-BLU-M', 5, 'active'),
  ('straight-jeans', 'آبی', 'L', 'SJ-BLU-L', 7, 'active'),
  ('straight-jeans', 'مشکی', 'S', 'SJ-BLK-S', 4, 'active'),
  ('straight-jeans', 'مشکی', 'M', 'SJ-BLK-M', 0, 'active'),
  ('straight-jeans', 'مشکی', 'L', 'SJ-BLK-L', 6, 'active'),
  ('straight-jeans', 'آبی روشن', 'S', 'SJ-LBL-S', 2, 'active'),
  ('straight-jeans', 'آبی روشن', 'M', 'SJ-LBL-M', 3, 'active'),
  ('straight-jeans', 'آبی روشن', 'L', 'SJ-LBL-L', 0, 'active'),
  ('winter-coat', 'مشکی', 'S', 'WC-BLK-S', 2, 'active'),
  ('winter-coat', 'مشکی', 'M', 'WC-BLK-M', 3, 'active'),
  ('winter-coat', 'مشکی', 'L', 'WC-BLK-L', 1, 'active'),
  ('winter-coat', 'مشکی', 'XL', 'WC-BLK-XL', 2, 'active'),
  ('winter-coat', 'زغالی', 'S', 'WC-CHR-S', 0, 'active'),
  ('winter-coat', 'زغالی', 'M', 'WC-CHR-M', 0, 'active'),
  ('winter-coat', 'زغالی', 'L', 'WC-CHR-L', 0, 'active'),
  ('winter-coat', 'زغالی', 'XL', 'WC-CHR-XL', 0, 'active'),
  ('simple-dress', 'زرشکی', 'S', 'SD-BRG-S', 1, 'active'),
  ('simple-dress', 'زرشکی', 'M', 'SD-BRG-M', 4, 'active'),
  ('simple-dress', 'زرشکی', 'L', 'SD-BRG-L', 2, 'active'),
  ('simple-dress', 'مشکی', 'S', 'SD-BLK-S', 0, 'active'),
  ('simple-dress', 'مشکی', 'M', 'SD-BLK-M', 3, 'active'),
  ('simple-dress', 'مشکی', 'L', 'SD-BLK-L', 0, 'active'),
  ('simple-dress', 'طلایی', 'S', 'SD-GLD-S', 2, 'active'),
  ('simple-dress', 'طلایی', 'M', 'SD-GLD-M', 0, 'active'),
  ('simple-dress', 'طلایی', 'L', 'SD-GLD-L', 1, 'active'),
  ('midi-skirt', 'زیتونی', 'S', 'MS-OLV-S', 3, 'active'),
  ('midi-skirt', 'زیتونی', 'M', 'MS-OLV-M', 2, 'active'),
  ('midi-skirt', 'زیتونی', 'L', 'MS-OLV-L', 4, 'active'),
  ('midi-skirt', 'سرمه‌ای', 'S', 'MS-NVY-S', 0, 'active'),
  ('midi-skirt', 'سرمه‌ای', 'M', 'MS-NVY-M', 1, 'active'),
  ('midi-skirt', 'سرمه‌ای', 'L', 'MS-NVY-L', 2, 'active'),
  ('cozy-hoodie', 'سرمه‌ای', 'S', 'HD-NVY-S', 4, 'active'),
  ('cozy-hoodie', 'سرمه‌ای', 'M', 'HD-NVY-M', 6, 'active'),
  ('cozy-hoodie', 'سرمه‌ای', 'L', 'HD-NVY-L', 2, 'active'),
  ('cozy-hoodie', 'خاکستری', 'S', 'HD-GRY-S', 2, 'active'),
  ('cozy-hoodie', 'خاکستری', 'M', 'HD-GRY-M', 4, 'active'),
  ('cozy-hoodie', 'خاکستری', 'L', 'HD-GRY-L', 0, 'active'),
  ('crewneck-sweater', 'طوسی', 'S', 'SW-GRY-S', 3, 'active'),
  ('crewneck-sweater', 'طوسی', 'M', 'SW-GRY-M', 5, 'active'),
  ('crewneck-sweater', 'طوسی', 'L', 'SW-GRY-L', 0, 'active'),
  ('crewneck-sweater', 'زرشکی', 'S', 'SW-BRG-S', 0, 'active'),
  ('crewneck-sweater', 'زرشکی', 'M', 'SW-BRG-M', 2, 'active'),
  ('crewneck-sweater', 'زرشکی', 'L', 'SW-BRG-L', 4, 'active'),
  ('crewneck-sweater', 'سبز', 'S', 'SW-GRN-S', 0, 'active'),
  ('crewneck-sweater', 'سبز', 'M', 'SW-GRN-M', 3, 'active'),
  ('crewneck-sweater', 'سبز', 'L', 'SW-GRN-L', 6, 'inactive'),
  ('cotton-shorts', 'خاکی', 'S', 'SH-KHK-S', 2, 'active'),
  ('cotton-shorts', 'خاکی', 'M', 'SH-KHK-M', 3, 'active'),
  ('silk-scarf', 'سرمه‌ای', 'فریسایز', 'SC-NVY-FR', 4, 'active'),
  ('silk-scarf', 'طلایی', 'فریسایز', 'SC-GLD-FR', 0, 'active')
) as v(product_slug, color, size, sku, stock_quantity, status)
join public.products p on p.slug = v.product_slug
on conflict (sku) do nothing;

-- Seeded: 5 categories, 10 products, 30 images, 65 variants.
