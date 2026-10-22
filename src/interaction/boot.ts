/** Chaves de localStorage da experiência (versão no sufixo). */
export const STORAGE_KEYS = {
  reading: "lainciano:leitura:v1",
  sound: "lainciano:som:v1",
  volume: "lainciano:volume:v1",
  relics: "lainciano:reliquias:v1",
  explorer: "lainciano:explorador:v1",
  game: "lainciano:jogo:v1",
} as const;

/** Aplica data-reading antes da pintura, evitando piscar efeitos para quem usa modo leitura. */
export const READING_BOOT_SCRIPT = `try{var p=localStorage.getItem("${STORAGE_KEYS.reading}");var r=matchMedia("(prefers-reduced-motion: reduce)").matches;document.documentElement.dataset.reading=(p==="on"||(p!=="off"&&r))?"on":"off"}catch(e){document.documentElement.dataset.reading="off"}`;

const BOT_UA = "bot|crawl|spider|slurp|lighthouse|headless|inspectiontool|facebookexternalhit|preview";

/**
 * Abre o Limiar (intro) só na primeira visita de um navegador com JS, storage e que não seja robô.
 * Ordem: chave de som já gravada ou robô/webdriver sai; modo leitura grava som "off" e sai;
 * senão abre o `<dialog id="limiar">` e marca `data-limiar="open"`. Roda depois do READING_BOOT_SCRIPT.
 */
export const LIMIAR_BOOT_SCRIPT = `try{var s="${STORAGE_KEYS.sound}";if(!localStorage.getItem(s)&&!(navigator.webdriver||/${BOT_UA}/i.test(navigator.userAgent))){if(document.documentElement.dataset.reading==="on"){localStorage.setItem(s,"off")}else{var d=document.getElementById("limiar");if(d&&typeof d.showModal==="function"){d.showModal();document.documentElement.dataset.limiar="open"}}}}catch(e){}`;
