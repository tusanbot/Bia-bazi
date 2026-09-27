# @bia-bazi/scala-quaranta-engine

Pure game engine for Scala Quaranta (Scala 40).

## Implemented rules

- 2–6 individual players
- 2 French decks + 4 Jokers (108 cards)
- 13 cards per player
- Sets of 3–4 cards of the same rank with different suits
- Runs of 3+ consecutive cards in one suit
- 40-point opening requirement
- Joker support with one Joker per meld
- Draw from stock or discard pile
- Pre-opening discard restrictions
- Extending any table meld after opening
- Joker replacement
- Round scoring and cumulative 101-point elimination
- Automatic round/match state transitions

The engine is deliberately UI-agnostic and contains no Telegram or Cloudflare dependencies.

## Rule choices

Scala Quaranta has regional and house-rule variations. This implementation follows the common Italian rules documented by Sisal: 108 cards, 13-card hands, a 40-point opening, discard-pile access, table meld extensions, Joker value based on its represented card, and a 101-point elimination threshold. A player taking the discard before opening must use that card in the opening. The final discard cannot be a Joker.

These choices can be moved into a rules configuration later without changing the room architecture.
