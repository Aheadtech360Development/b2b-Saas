/**
 * The brand's own header and footer, around a storefront page.
 *
 * This used to live in the root layout, which decided from the request path
 * whether to draw it. That is right for the first page of a visit and wrong
 * for every one after it: the root layout is shared by every route, and the
 * App Router keeps a shared layout mounted across client-side navigation
 * rather than re-rendering it. So the chrome drawn for the shop stayed on
 * screen when the same tab moved into the admin console — a storefront navbar
 * sitting above someone's dashboard, with no way for the layout to know the
 * route had changed.
 *
 * Rendered by the storefront's own segments now, so it mounts and unmounts
 * with them and no path list has to be kept in step with the routes.
 */
import { Header } from "@/components/layout/Header";
import ThemeChrome, { ThemeChromeHead, loadStore } from "@/components/storefront/ThemeChrome";

export default async function StorefrontShell({ children }: { children: React.ReactNode }) {
  const { brand, chrome } = await loadStore();

  // Three cases, and only the middle one wants the app's own header: a themed
  // shop wears the brand's chrome, a shop with no theme yet wears the app's,
  // and the platform's own address is not a shop at all — its page brings its
  // own header, so adding the app's put two of them on the screen.
  const appHeader = brand !== null && chrome === null;

  return (
    <>
      {appHeader && <Header />}
      {chrome && <ThemeChromeHead chrome={chrome} />}
      {chrome && <ThemeChrome sections={chrome.top} />}
      {children}
      {chrome && <ThemeChrome sections={chrome.bottom} />}
    </>
  );
}
