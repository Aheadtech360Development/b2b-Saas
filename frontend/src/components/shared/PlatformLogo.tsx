/**
 * PlatformLogo — PrintCoPilot's logo, as printcopilot.co's header has it.
 *
 * The navy mark alone, never the name written out (the owner's rule). On a
 * dark ground it sits on a white tile so it reads, the same tile as the site's
 * header and the admin sidebar. Its alt text names it, for a link or button
 * that has nothing else to say.
 */
export function PlatformLogo({ onDark = false, size = 32 }: {
  /** The ground is navy: draw the white tile behind the mark. */
  onDark?: boolean;
  size?: number;
}) {
  const mark = (
    // eslint-disable-next-line @next/next/no-img-element -- a fixed-size mark
    <img src="/icon_navy_128.png" alt="PrintCoPilot" width={size} height={size}
      style={{ display: "block", width: size, height: size, flex: "none" }} />
  );
  if (!onDark) return mark;
  return (
    <span style={{
      width: size + 12, height: size + 12, borderRadius: 10, background: "#FFFFFF", flex: "none",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      {mark}
    </span>
  );
}
