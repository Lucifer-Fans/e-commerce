/**
 * Where the mobile bottom bar steps aside.
 *
 * The product page is one long column ending in the buy controls, and a bar
 * pinned over it costs the shopper height exactly where they need it most. So
 * on that route the four tabs are dropped and the two the shopper still needs —
 * wishlist and cart — move back up into the header, which is sticky anyway.
 *
 * Header, Layout (which reserves the bar's height) and the bar itself all read
 * this one predicate, so the three can never disagree about which it is.
 */
const HEADER_SHOP_ICON_ROUTES = [/^\/product\/[^/]+\/?$/];

export default function usesHeaderShopIcons(pathname) {
  return HEADER_SHOP_ICON_ROUTES.some((route) => route.test(pathname));
}
