/** Abertura do protótipo (salas.html 373–386): as letras do nome reagem ao mouse antes de desabar. */
export const NAME_HOVER = { radius: 260, lift: 40, hotAbove: 0.55, tweenS: 0.4, leaveS: 0.6 } as const;

/** Reação de uma letra a um ponteiro a `distance` px do seu centro: sobe e avermelha ao chegar perto. */
export function nameReaction(distance: number): { lift: number; hot: boolean } {
  const f = Math.max(0, 1 - distance / NAME_HOVER.radius);
  return { lift: -f * NAME_HOVER.lift, hot: f > NAME_HOVER.hotAbove };
}
