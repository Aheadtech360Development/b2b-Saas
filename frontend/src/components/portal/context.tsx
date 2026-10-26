"use client";

/**
 * What the portal's shell knows about the shop, for its pages: whether it
 * sells print jobs at all. A shop whose plan has no gang sheets refuses the
 * print job API, so the menu, the home page and the buttons that start a sheet
 * leave them out there rather than opening onto an error.
 */
import { createContext, useContext } from "react";

export interface PortalInfo {
  /** null until known. */
  printing: boolean | null;
}

export const PortalContext = createContext<PortalInfo>({ printing: null });

export const usePortal = () => useContext(PortalContext);
