"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  telegramAuthDiagnostics,
  telegramInitData,
  telegramStartParam,
  telegramUser,
  initTelegram
} from "../../lib/telegram";

export default function TelegramDebugPage() {
  const [diagnostics, setDiagnostics] = useState<ReturnType<typeof telegramAuthDiagnostics> | null>(null);
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);
  const [startParam, setStartParam] = useState("");
  const [initDataLength, setInitDataLength] = useState(0);

  function refresh() {
    initTelegram();
    setDiagnostics(telegramAuthDiagnostics());
    setUser(telegramUser());
    setStartParam(telegramStartParam());
    setInitDataLength(telegramInitData().length);
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
  }, []);

  const rows = diagnostics
    ? [
        ["window.Telegram", diagnostics.hasTelegramObject],
        ["Telegram.WebApp", diagnostics.hasWebApp],
        ["initData", diagnostics.hasInitData],
        ["initData length", diagnostics.initDataLength],
        ["initDataUnsafe.user", diagnostics.hasUnsafeUser],
        ["raw tgWebAppData", diagnostics.hasRawInitData],
        ["start_param", diagnostics.hasStartParam],
        ["host", diagnostics.host]
      ]
    : [];

  const authenticated = Boolean(diagnostics?.hasInitData && user);

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand-mark">🔎</div>
        <div>
          <div className="eyebrow">TELEGRAM DEBUG</div>
          <h1>تشخیص اتصال تلگرام</h1>
          <p>این صفحه هیچ مقدار حساس initData را نمایش نمی‌دهد.</p>
        </div>
      </header>

      <section className="room-panel">
        <div className={authenticated ? "mode-hint" : "error"}>
          <strong>{authenticated ? "احراز هویت تلگرام برقرار است" : "initData معتبر دریافت نشده است"}</strong>
          <p>
            {authenticated
              ? "WebApp یک initData امضاشده دارد و سرور می‌تواند آن را اعتبارسنجی کند."
              : diagnostics?.hasWebApp && diagnostics.hasUnsafeUser
                ? "Telegram.WebApp و کاربر دیده می‌شوند، اما initData امضاشده وجود ندارد؛ این حالت معمولاً به نحوه باز شدن Mini App یا تنظیمات Main Mini App مربوط است."
                : "صفحه در حال حاضر در یک Telegram WebApp احراز هویت‌شده اجرا نشده است."}
          </p>
        </div>

        <div className="section-title">
          <h2>وضعیت فنی</h2>
          <span>زنده</span>
        </div>

        <div className="active-rooms">
          {rows.map(([label, value]) => (
            <div className="active-room" key={label}>
              <div className="active-room-copy">
                <strong>{label}</strong>
                <span>{typeof value === "boolean" ? (value ? "بله" : "خیر") : String(value || "—")}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="section-title">
          <h2>اطلاعات غیرحساس</h2>
          <span>بدون توکن</span>
        </div>

        <div className="active-rooms">
          <div className="active-room">
            <div className="active-room-copy">
              <strong>کاربر</strong>
              <span>{user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || String(user.id) : "—"}</span>
            </div>
          </div>
          <div className="active-room">
            <div className="active-room-copy">
              <strong>start_param</strong>
              <span>{startParam || "—"}</span>
            </div>
          </div>
          <div className="active-room">
            <div className="active-room-copy">
              <strong>طول initData</strong>
              <span>{initDataLength}</span>
            </div>
          </div>
        </div>

        <button className="primary wide" onClick={refresh}>بررسی مجدد</button>
        <Link className="secondary wide" href="/">بازگشت</Link>
      </section>
    </main>
  );
}
