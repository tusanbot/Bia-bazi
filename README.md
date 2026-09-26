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

کل پروژه روی **یک Cloudflare Worker** به نام `bia-bazi` اجرا می‌شود. نیازی به Worker جداگانه برای Web یا Game Room نیست.

### معماری

```
Telegram Mini App
       │
       ▼
bia-bazi Worker
   ┌───┴───────────────┐
   │                   │
   ▼                   ▼
Static Web          /api/room
Next.js export          │
                       ▼
                 GAME_ROOM
                Durable Object
                       │
                       ▼
                  Hokm Engine
```

Binding موجود `GAME_ROOM` همان Durable Object بازی است و **Worker جداگانه‌ای نیست**.

### Cloudflare تنظیمات Worker

Worker:

```
bia-bazi
```

Bindingها:

- Durable Object binding: `GAME_ROOM`
- Asset binding: `ASSETS` (برای خروجی `apps/web/out`)

Secret:

```
TELEGRAM_BOT_TOKEN
```

که باید توکن همان ربات تلگرامی باشد.

### Build و Deploy

از ریشه repository:

```bash
npm install
npm run deploy:bia-bazi
```

این دستور ابتدا Next.js را به‌صورت static در `apps/web/out` build می‌کند و سپس همان Worker `bia-bazi` را deploy می‌کند.

اگر از Cloudflare Workers Builds استفاده می‌کنی، Build command را به:

```bash
npm install && npm run build:bia-bazi
```

و Deploy command را به استقرار Worker موجود پروژه تنظیم کن.

### مسیرها

```
/                       → Mini App
/api/room?room=<id>     → Game Room Durable Object
```

بنابراین باز کردن:

```
https://bia-bazi.<subdomain>.workers.dev/
```

باید صفحه «بیا بازی» را نمایش دهد و دیگر نباید `room is required` برگرداند.

### Telegram Mini App

URL اصلی Mini App همان URL Worker است:

```
https://bia-bazi.<subdomain>.workers.dev/
```

این URL را در تنظیمات Mini App ربات در BotFather قرار بده.

### نکته

در نسخه قبلی Web و Game Room جدا در نظر گرفته شده بودند. ساختار نهایی پروژه اکنون عمداً به یک Worker واحد برگشته است تا Deployment فعلی Cloudflare تو با Binding `GAME_ROOM` سازگار بماند.


### اتاق‌های فعال و لینک دعوت

اتاق‌های در انتظار شروع در یک Durable Object رجیستری مرکزی با شناسه ثابت `__room_registry__` ثبت می‌شوند. این رجیستری فقط discovery را انجام می‌دهد و state لحظه‌ای هر بازی همچنان داخل Durable Object اختصاصی همان اتاق باقی می‌ماند. این جداسازی باعث می‌شود API فهرست اتاق‌ها بعداً بتواند بدون تغییر رابط کاربری به D1 منتقل شود.

لینک دعوت از نوع Main Mini App Telegram ساخته می‌شود:

`https://t.me/<bot_username>?startapp=room_<room_id>`

Telegram مقدار `startapp` را به‌عنوان `start_param` به Mini App تحویل می‌دهد و برنامه با همان شناسه دقیق Durable Object وارد اتاق می‌شود.
