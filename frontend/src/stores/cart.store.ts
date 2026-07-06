/**
 * Zustand cart store.
 */
import { create } from "zustand";
import type { Cart, CartItem } from "@/types/order.types";

interface CartState {
  cart: Cart | null;
  isLoading: boolean;
  itemCount: number;

  // Actions
  setCart: (cart: Cart) => void;
  clearCart: () => void;
  setLoading: (loading: boolean) => void;

  // Derived
  totalItems: () => number;
  isValid: () => boolean;
}

export const useCartStore = create<CartState>((set, get) => ({
  cart: null,
  isLoading: false,
  itemCount: 0,

  setCart: (cart) => {
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    set({ cart, itemCount, isLoading: false });
  },

  clearCart: () => set({ cart: null, itemCount: 0, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  totalItems: () => get().itemCount,

  isValid: () => {
    const cart = get().cart;
    return cart?.validation.is_valid ?? false;
  },
}));
