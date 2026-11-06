/**
 * Fabric defaults for the designer, set once when the designer loads.
 *
 * The extra properties are what the builder adds to an object (what kind it
 * is, the original picture's pixel width, a names-and-numbers role, the text
 * curve) so they survive a save and a reload.
 */
import { FabricObject, IText } from "fabric";

export const CUSTOM_PROPS = ["uid", "kind", "srcW", "nn", "curve", "graphicId", "label"];

FabricObject.customProperties = CUSTOM_PROPS;

const ACCENT = "#2457F5";

FabricObject.ownDefaults = {
  ...FabricObject.ownDefaults,
  transparentCorners: false,
  cornerColor: "#FFFFFF",
  cornerStrokeColor: ACCENT,
  borderColor: ACCENT,
  cornerStyle: "circle",
  cornerSize: 14,
  touchCornerSize: 32,
  borderScaleFactor: 1.6,
  // The frame sits close to the art: everything inside it can be grabbed and
  // dragged (padding would draw the frame around space that cannot).
  padding: 4,
  // Rotating by hand settles on 15° steps when close to one.
  snapAngle: 15,
  snapThreshold: 4,
  lockScalingFlip: true,
  objectCaching: true,
};

IText.ownDefaults = {
  ...IText.ownDefaults,
  editingBorderColor: ACCENT,
  cursorColor: ACCENT,
  selectionColor: "rgba(36,87,245,0.18)",
};

/**
 * Every handle: corners keep the art's proportions, the side handles stretch
 * it sideways or up and down, and the top handle rotates it.
 */
export function decorate(o: FabricObject) {
  o.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true });
}
