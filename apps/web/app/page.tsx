import { GameCard } from "../components/GameCard";

export default function Home() {
  return (
    <main className="shell">
      <header className="hero">
        <div className="brand-mark">🎮</div>
        <div>
          <div className="eyebrow">BIA BAZI</div>
          <h1>بیا بازی</h1>
          <p>بازی‌های چندنفره، مستقیم داخل تلگرام.</p>
        </div>
      </header>

      <section className="profile-card">
        <div className="avatar">👤</div>
        <div>
          <strong>ورود با تلگرام</strong>
          <span>حساب تلگرام شما به‌صورت امن به بازی متصل می‌شود.</span>
        </div>
        <button className="primary">ورود</button>
      </section>

      <section>
        <div className="section-title">
          <h2>بازی‌ها</h2>
          <span>۱ بازی فعال</span>
        </div>
        <GameCard
          emoji="🃏"
          title="حکم"
          subtitle="بازی کلاسیک ۴ نفره"
          meta="۴ بازیکن"
        />
      </section>

      <section className="stats">
        <div><b>۰</b><span>بازی</span></div>
        <div><b>۰</b><span>برد</span></div>
        <div><b>۰</b><span>امتیاز</span></div>
      </section>

      <nav className="bottom-nav">
        <a className="active">خانه</a>
        <a>بازی‌ها</a>
        <a>رتبه‌بندی</a>
        <a>پروفایل</a>
      </nav>
    </main>
  );
}