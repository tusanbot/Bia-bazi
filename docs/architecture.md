# معماری بیا بازی

## 1. Identity
ورود کاربران با Telegram Mini App `initData` انجام می‌شود. Backend پس از اعتبارسنجی، کاربر را در D1 upsert می‌کند.

## 2. Room lifecycle
`waiting → starting → active → finished`

در حالت waiting، دکمه ورود فعال است. با تکمیل ظرفیت، Room قفل و بازی starting می‌شود.

## 3. Game state
State لحظه‌ای داخل Durable Object همان Room نگهداری می‌شود. هیچ تصمیم حیاتی بازی نباید صرفاً در کلاینت گرفته شود.

## 4. Rating
برای هر بازی Result ثبت می‌شود و سپس rating/statistics به‌صورت تراکنشی به‌روزرسانی می‌شود.

## 5. Group announcements
پس از ساخت Room، تکمیل ظرفیت، شروع و پایان بازی، Bot پیام گروه را ویرایش یا ارسال می‌کند تا از پیام‌های اضافی جلوگیری شود.

## 6. Extensibility
هر بازی یک GameDefinition و GameEngine مستقل دارد. هسته Room، User، Rating و Notification مشترک است.