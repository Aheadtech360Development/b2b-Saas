"use client";
import { useCallback, useRef } from "react";
import { attachAddressSuggestions } from "@/lib/addressSuggest";

interface AddressComponents {
  street: string;
  city: string;
  state: string;
  zipCode: string;
}

// A store that sets a Google Maps key (app/layout.tsx loads the script) keeps
// Google's widget. Every other store asks its own server, which asks Geoapify
// (api/v1/address.py) — no key in the page.
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/**
 * Address suggestions on a street field: `ref={useAddressAutocomplete(fill)}`.
 *
 * A callback ref, so the suggestions attach whenever the field appears — the
 * address forms show it only once a page has loaded, or when "a new address"
 * is chosen — and come off when it goes.
 */
export function useAddressAutocomplete(
  onAddressSelect: (components: AddressComponents) => void
) {
  const callbackRef = useRef(onAddressSelect);
  callbackRef.current = onAddressSelect;
  const detach = useRef<(() => void) | null>(null);

  return useCallback((input: HTMLInputElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!input || typeof window === "undefined") return;
    detach.current = GOOGLE_KEY
      ? attachGoogle(input, (c) => callbackRef.current(c))
      : attachAddressSuggestions(input, (s) => callbackRef.current({
          street: s.line1,
          city: s.city,
          state: s.state,
          zipCode: s.postal_code,
        }));
  }, []);
}

function attachGoogle(input: HTMLInputElement, onSelect: (c: AddressComponents) => void): () => void {
  let retryCount = 0;
  let stopped = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let autocomplete: any = null;

  const initAutocomplete = () => {
    if (stopped) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).google?.maps?.places) {
      if (retryCount < 20) {
        retryCount++;
        setTimeout(initAutocomplete, 500);
      }
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gm = (window as any).google.maps;
    autocomplete = new gm.places.Autocomplete(input, {
      componentRestrictions: { country: "us" },
      fields: ["address_components"],
      types: ["address"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place?.address_components) return;

      let streetNumber = "";
      let streetName = "";
      let city = "";
      let state = "";
      let zipCode = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      place.address_components.forEach((component: any) => {
        const types: string[] = component.types;
        if (types.includes("street_number")) streetNumber = component.long_name;
        if (types.includes("route")) streetName = component.long_name;
        if (types.includes("locality")) city = component.long_name;
        if (types.includes("administrative_area_level_1")) state = component.short_name;
        if (types.includes("postal_code")) zipCode = component.long_name;
      });

      onSelect({
        street: `${streetNumber} ${streetName}`.trim(),
        city,
        state,
        zipCode,
      });
    });
  };

  initAutocomplete();

  return () => {
    stopped = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (autocomplete && (window as any).google?.maps?.event) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).google.maps.event.clearInstanceListeners(autocomplete);
    }
  };
}
