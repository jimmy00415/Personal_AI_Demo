/**
 * Route helpers that behave the same on the dev server ("/ask") and on
 * GitHub Pages, where the static export serves every route with a trailing
 * slash ("/ask/").
 */
export function normalizePath(pathname: string | null | undefined): string {
  if (!pathname) return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizePath(a) === normalizePath(b);
}

export function shellLayout(rawPathname: string | null | undefined, emergency: boolean) {
  const pathname = normalizePath(rawPathname);
  const bare = pathname === "/print";
  const hideChrome = (emergency && pathname === "/ask") || bare || pathname === "/dev";
  return {
    pathname,
    bare,
    hideChrome,
    hideFab: hideChrome || pathname === "/ask" || pathname === "/book",
    showAskLink: pathname !== "/ask",
    isActive: (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href)),
  };
}
