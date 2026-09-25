type Props = {
  emoji: string;
  title: string;
  subtitle: string;
  meta: string;
  playerModes?: number[];
  selectedMode?: number;
  onModeChange?: (count: number) => void;
  onPlay?: () => void;
};

export function GameCard({ emoji, title, subtitle, meta, playerModes = [], selectedMode, onModeChange, onPlay }: Props) {
  return (
    <article className="game-card">
      <div className="game-icon">{emoji}</div>
      <div className="game-copy">
        <h3>{title}</h3>
        <p>{subtitle}</p>
        <small>{meta}</small>
        {playerModes.length > 0 && (
          <div className="player-modes" aria-label="حالت‌های تعداد بازیکن">
            {playerModes.map(count => (
              <button key={count} type="button" className={selectedMode === count ? "mode-chip selected" : "mode-chip"} aria-pressed={selectedMode === count} onClick={() => onModeChange?.(count)}>
                {count} نفره
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="play" type="button" onClick={onPlay}>بازی</button>
    </article>
  );
}
