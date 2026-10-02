/**
 * Short messages for things that happened.
 *
 * The builder does a lot on one click — rearranging a sheet, opening another,
 * moving designs between them — and without a word afterwards the only way to
 * know it worked is to go and look. These say what happened, once, and go
 * away. They are not for every click: a drag or a selection speaks for itself.
 */
import { toast, type ToastOptions } from "react-toastify";

const base: ToastOptions = {
  position: "bottom-right",
  autoClose: 2600,
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
  theme: "light",
};

export const say = {
  done: (text: string) => toast.success(text, base),
  note: (text: string) => toast.info(text, base),
  /** Something the person has to act on, so it waits to be dismissed. */
  warn: (text: string) => toast.warn(text, { ...base, autoClose: 6000 }),
  problem: (text: string) => toast.error(text, { ...base, autoClose: 6000 }),
};
