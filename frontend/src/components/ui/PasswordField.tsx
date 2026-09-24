"use client";

/**
 * A password box you can look inside.
 *
 * Typing a password you cannot see, on a phone keyboard, is how people end up
 * locked out of an account they just created — so every password box on the
 * way in gets the same eye, in the same place, doing the same thing.
 *
 * Everything else is a plain <input>: props pass straight through, so a page
 * styles it exactly as it styles its other fields.
 */
import { useId, useState } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Class for the wrapper, when a page's CSS needs to reach it. */
  wrapperClassName?: string;
};

export function PasswordField({ wrapperClassName = "", style, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  const label = shown ? "Hide password" : "Show password";
  const hint = useId();

  return (
    <span
      className={wrapperClassName}
      style={{ position: "relative", display: "block", width: "100%" }}
    >
      <input
        {...rest}
        type={shown ? "text" : "password"}
        // Room for the eye, whatever padding the page gave the field.
        style={{ ...style, paddingRight: 44 }}
        aria-describedby={hint}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        title={label}
        aria-label={label}
        aria-pressed={shown}
        style={{
          position: "absolute",
          top: "50%",
          right: 6,
          transform: "translateY(-50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          padding: 0,
          border: "none",
          background: "none",
          color: "#6B6B6B",
          cursor: "pointer",
          borderRadius: 6,
        }}
      >
        {shown ? <EyeOff /> : <Eye />}
      </button>
      <span id={hint} style={SR_ONLY}>
        {shown ? "Your password is visible." : "Your password is hidden."}
      </span>
    </span>
  );
}

const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

const svg = {
  width: 19,
  height: 19,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const Eye = () => (
  <svg {...svg} aria-hidden>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

const EyeOff = () => (
  <svg {...svg} aria-hidden>
    <path d="M10.7 6.1A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a18 18 0 0 1-3.2 4.1" />
    <path d="M6.3 7.9A17.8 17.8 0 0 0 2 12s3.6 6.5 10 6.5a9.7 9.7 0 0 0 3.9-.8" />
    <path d="M10 10a2.8 2.8 0 0 0 4 4" />
    <path d="m3 3 18 18" />
  </svg>
);

export default PasswordField;
