"use client";
import { useEffect, useRef } from "react";

interface AddressComponents {
  street: string;
  city: string;
  state: string;
  zipCode: string;
}

export function useAddressAutocomplete(
  onAddressSelect: (components: AddressComponents) => void
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const callbackRef = useRef(onAddressSelect);
  callbackRef.current = onAddressSelect;

  useEffect(() => {
    let retryCount = 0;
    let autocomplete: any = null;

    const initAutocomplete = () => {
      if (!inputRef.current) return;
      if (typeof window === "undefined") return;
      if (!(window as any).google?.maps?.places) {
        if (retryCount < 20) {
          retryCount++;
          setTimeout(initAutocomplete, 500);
        }
        return;
      }

      const gm = (window as any).google.maps;
      autocomplete = new gm.places.Autocomplete(inputRef.current, {
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

        callbackRef.current({
          street: `${streetNumber} ${streetName}`.trim(),
          city,
          state,
          zipCode,
        });
      });
    };

    initAutocomplete();

    return () => {
      if (autocomplete && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return inputRef;
}
