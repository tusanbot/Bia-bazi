type Props = {
  emoji: string;
  title: string;
  subtitle: string;
  meta: string;
};

export function GameCard({ emoji, title, subtitle, meta }: Props) {
  return (
    <article className="game-card">
      <div className="game-icon">{emoji}</div>
      <div className="game-copy">
        <h3>{title}</h3>
        <p>{subtitle}</p>
        <small>{meta}</small>
      </div>
      <button className="play">بازی</button>
    </article>
  );
}