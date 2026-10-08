/** Chaves de localStorage da experiência (versão no sufixo). */
export const STORAGE_KEYS = {
  reading: "lainciano:leitura:v1",
  sound: "lainciano:som:v1",
  relics: "lainciano:reliquias:v1",
} as const;

/** Aplica data-reading antes da pintura, evitando piscar efeitos para quem usa modo leitura. */
export const READING_BOOT_SCRIPT = `try{var p=localStorage.getItem("${STORAGE_KEYS.reading}");var r=matchMedia("(prefers-reduced-motion: reduce)").matches;document.documentElement.dataset.reading=(p==="on"||(p!=="off"&&r))?"on":"off"}catch(e){document.documentElement.dataset.reading="off"}`;

/** Abre o Portal só na primeira visita de um navegador com JS, storage e que não seja robô. */
export const PORTAL_BOOT_SCRIPT = `try{if(!localStorage.getItem("${STORAGE_KEYS.sound}")&&!(navigator.webdriver||/bot|crawl|spider|slurp|lighthouse|headless|inspectiontool|facebookexternalhit|preview/i.test(navigator.userAgent))){var d=document.getElementById("portal");if(d&&typeof d.showModal==="function")d.showModal()}}catch(e){}`;
