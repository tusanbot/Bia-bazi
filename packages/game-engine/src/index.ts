export type PlayerId = string;

export interface GamePlayer { id: PlayerId; seat: number; displayName?: string; username?: string; }

export interface GameDefinition<State = unknown, Action = unknown> {
  id: string;
  minPlayers: number;
  maxPlayers: number;
  createState(players: GamePlayer[]): State;
  applyAction(state: State, action: Action, playerId: PlayerId): State;
  isFinished(state: State): boolean;
}

export interface GameResult { winners: PlayerId[]; scores: Record<PlayerId, number>; }
