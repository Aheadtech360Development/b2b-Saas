import { useState, useEffect, useRef } from "react";

export function useAdminData<T>(
  fetchFn: () => Promise<T>,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isFirstLoad = useRef(true);

  async function load() {
    // Pehli baar loading show karo, baad mein nahi
    if (isFirstLoad.current) {
      setIsLoading(true);
    }
    try {
      const result = await fetchFn();
      setData(result);
    } finally {
      setIsLoading(false);
      isFirstLoad.current = false;
    }
  }

  useEffect(() => {
    load();
  }, deps);

  return { data, isLoading, reload: load };
}