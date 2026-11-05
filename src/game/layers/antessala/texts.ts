/**
 * Textos da Antessala. Regra do dono (04/11): legendas, falas e textos de documento com ortografia correta (maiúscula
 * no início da frase, acentos); rótulos de interface (verbos do aviso, nomes de lugar e de item) em minúsculas.
 *
 * As frases da bíblia entram LITERAIS (só a maiúscula de começo de frase); o resto é RASCUNHO, curto, e só vira texto
 * de jogo depois do ok do dono (risco R8: nada de inventar história). A casca (B8) ainda não liga nenhum destes: as
 * interações dos objetos são da B16 e a porta norte, da B17.
 */

/** Da bíblia (§7), literais. */
export const BIBLIA = {
  sms: "Bem-vindo à rede.",
  chapeu: "Um chapéu preto. Alguém aqui dizia o próprio nome devagar.",
  allstar: "O cadarço de um está desamarrado, como se alguém tivesse acabado de tirar.",
  caneca: "Café. Frio.",
  canecaMorna: "Café. Morno.",
  leitor: "Saldo: 1 relíquia · acesso liberado",
  muda: "Para regar quando voltar · TK",
  placa: "lainciano · camada 01",
} as const;

// RASCUNHO: dono aprova. Falas curtas da casca (a ligar na B16/B17).
export const RASCUNHO = {
  janela: "A névoa do lago encosta no vidro. Lá longe, um poste de sódio.",
  portaNorte: "Trancada. Do outro lado, um corredor no escuro.",
  portaSul: "Fechou atrás de mim.",
  porao: "Trancada. Moscas, do outro lado.",
} as const;
