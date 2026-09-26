# بیا بازی 🎮

پلتفرم بازی‌های چندنفره تلگرامی با Telegram Mini App.

## معماری
- Telegram Bot + Inline Mode
- Cloudflare Workers
- Durable Objects برای Game Room و state لحظه‌ای
- Cloudflare D1 برای کاربران، امتیاز، رتبه‌بندی و رکوردها
- Telegram Mini App برای رابط بازی
- Game Engine مستقل از نوع بازی

## اولین بازی
- حکم (Hokm) — **۲، ۳ یا ۴ نفره**

### منطق سه حالت حکم
- **۲ نفره:** ۵ کارت اولیه، انتخاب حکم، هر بازیکن ۲ کارت را کنار می‌گذارد و سپس با دسته ذخیره دست ۱۳ کارتی خود را کامل می‌کند.
- **۳ نفره:** یک کارت ۲ کنار گذاشته می‌شود، ۵ + ۴ + ۴ + ۴ کارت پخش می‌شود و هر بازیکن ۱۷ کارت دارد؛ بازیکنان مستقل هستند و تیم ثابت ندارند.
- **۴ نفره:** نسخه کلاسیک تیمی ۲ در برابر ۲؛ ۵ + ۴ + ۴ کارت و ۱۳ کارت برای هر بازیکن.

قانون Follow Suit، تعیین برنده Trick، نوبت‌ها، تیم‌بندی و state بازی در `packages/hokm-engine` از تعداد بازیکنان مستقل شده است.

## وضعیت توسعه
- [x] هسته مستقل بازی
- [x] مدل ۲، ۳ و ۴ نفره حکم
- [x] مدل کارت، خال، حکم و Trick
- [x] Follow Suit
- [x] منطق ساخت دست دو نفره
- [ ] اتصال Game Room به Durable Object
- [ ] ورود با Telegram
- [ ] رابط کامل Mini App
- [ ] امتیاز، رتبه‌بندی و رکورد
- [ ] اعلان نتیجه در گروه

## جریان اصلی
Inline Mode → انتخاب بازی → ساخت Room → انتشار پیام در گروه → Join → تکمیل ظرفیت → شروع بازی → Mini App → نتیجه/امتیاز/رکورد در گروه

## توسعه
این مخزن به‌صورت monorepo طراحی شده تا بازی‌های بعدی بدون تغییر هسته اضافه شوند.

### تغییر حالت اتاق حکم

اتاق حکم در وضعیت `waiting` می‌تواند بین حالت‌های ۲، ۳ و ۴ نفره جابه‌جا شود. تغییر حالت فقط زمانی مجاز است که:

- بازی هنوز شروع نشده باشد.
- حالت جدید بین ۲ تا ۴ نفر باشد.
- تعداد بازیکنان حاضر از ظرفیت جدید بیشتر نباشد.

بنابراین نمونه‌های معتبر شامل `۲ → ۳`، `۲ → ۴` و `۴ → ۳` (در صورت حضور حداکثر ۳ بازیکن) هستند. پس از شروع بازی، ظرفیت و حالت اتاق ثابت می‌ماند.

## استقرار روی Cloudflare

این پروژه به‌صورت کامل روی **Cloudflare Workers** طراحی شده و برای اجرای بخش وب به Vercel وابسته نیست.

### معماری استقرار

دو Worker مستقل داریم:

```
Telegram Mini App
        │
        ▼
bia-bazi-web
(Next.js + OpenNext)
        │
        │ /api/room
        ▼
bia-bazi
(Game Room Worker)
        │
        ▼
GameRoomDurableObject
        │
        ▼
hokm-engine
```

- `apps/web` → رابط کاربری Mini App و Route Handlerهای وب
- `workers/game-room` → اتاق بازی، احراز هویت Telegram و Durable Object
- `workers/api` → API قدیمی/کمکی و خارج از مسیر اصلی بازی

Cloudflare برای پروژه‌های Next.js مسیر Workers را پشتیبانی می‌کند و OpenNext می‌تواند خروجی Next.js را به Worker و assetهای قابل استقرار تبدیل کند. citeturn0search1turn0search4

### استقرار Web Worker

در Cloudflare یک Worker برای `apps/web` با این مشخصات بسازید:

- **Root directory:** `apps/web`
- **Build command:** `npm run build` یا استفاده از script آماده `npm run deploy`
- **Worker name:** `bia-bazi-web`

فایل `apps/web/wrangler.toml` از قبل برای OpenNext تنظیم شده است.

متغیر زیر را در تنظیمات Worker وب ثبت کنید:

- `GAME_ROOM_URL` → آدرس Worker مربوط به `workers/game-room`

مثال:

```
GAME_ROOM_URL=https://bia-bazi.<your-subdomain>.workers.dev
```

### استقرار Game Room Worker

برای Worker بازی:

```bash
cd workers/game-room
npm install
npx wrangler secret put TELEGRAM_BOT_TOKEN
npm run deploy
```

`TELEGRAM_BOT_TOKEN` باید توکن همان رباتی باشد که Mini App را باز می‌کند.

### استقرار Web

```bash
cd apps/web
npm install
npm run deploy
```

پس از استقرار، آدرس `bia-bazi-web` نقطه ورود Mini App است؛ آدرس Worker `bia-bazi` مستقیماً برای نمایش رابط کاربری استفاده نمی‌شود و مسئول Game Room است.

### متغیرهای لازم

| Worker | متغیر | کاربرد |
|---|---|---|
| `bia-bazi-web` | `GAME_ROOM_URL` | اتصال Web به Game Room |
| `bia-bazi` | `TELEGRAM_BOT_TOKEN` | اعتبارسنجی HMAC داده Telegram |

توکن ربات هرگز نباید داخل Client یا فایل‌های عمومی Web قرار بگیرد.

### مسیر درخواست بازی

```
GET  /api/room?room=<roomId>
POST /api/room?room=<roomId>

Web Worker
   ↓
GAME_ROOM_URL
   ↓
Game Room Worker
   ↓
Durable Object
```

بنابراین اگر URL مربوط به Game Room را مستقیماً بدون پارامتر `room` باز کنید، پاسخ `{"error":"room is required"}` طبیعی است؛ این Worker یک backend است و صفحه اصلی Mini App را سرو نمی‌کند.

