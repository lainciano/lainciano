/** Link ativo: a própria rota ou uma filha dela (a raiz só em "/"). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
