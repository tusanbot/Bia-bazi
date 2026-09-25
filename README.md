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
- حکم (Hokm) — ۴ نفره

## جریان اصلی
Inline Mode → انتخاب بازی → ساخت Room → انتشار پیام در گروه → Join → تکمیل ظرفیت → شروع بازی → Mini App → نتیجه/امتیاز/رکورد در گروه

## توسعه
این مخزن به‌صورت monorepo طراحی شده تا بازی‌های بعدی بدون تغییر هسته اضافه شوند.