/**
 * PlatformLogo — PrintCoPilot's wordmark, the owner's own files.
 *
 * On a navy ground the off-white one (wordmark-horizontal_color-on-dark), on
 * any light ground the navy one (wordmark-horizontal_color), the same in every
 * place the platform names itself: the site's header and footer, the admin,
 * the Platform Console, the partner portal, sign-in and onboarding. Never the
 * name typed out beside it. Its alt text names it, for a link or button that
 * has nothing else to say.
 *
 * `width` sets the size (the wordmark is 7.5 times as wide as it is tall); a
 * `className` with its own width wins over it, for a smaller one on a phone.
 */
const ON_DARK = "/wordmark-horizontal_color-on-dark_1200w.png";
const ON_LIGHT = "/wordmark-horizontal_color_600w.png";
const RATIO = 7.5;

export function PlatformLogo({ onDark = false, width = 180, className }: {
  /** The ground is navy: the off-white wordmark. */
  onDark?: boolean;
  width?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a fixed-size logo
    <img src={onDark ? ON_DARK : ON_LIGHT} alt="PrintCoPilot" width={width} height={Math.round(width / RATIO)}
      className={className} style={{ display: "block", flex: "none", height: "auto" }} />
  );
}
