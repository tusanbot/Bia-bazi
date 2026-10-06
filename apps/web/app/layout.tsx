import type { Metadata } from "next";
import "./globals.css";
import "../components/taxi-fare/taxi-fare.css";

export const metadata: Metadata = {
  title: "بیا بازی",
  description: "بازی‌های چندنفره تلگرامی"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        {/* Telegram requires this library in <head> before app scripts. */}
        <script src="https://telegram.org/js/telegram-web-app.js?63" />
      </head>
      <body>{children}</body>
    </html>
  );
}
