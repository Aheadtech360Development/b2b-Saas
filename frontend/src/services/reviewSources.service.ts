/**
 * Marketing → Reviews: where the shop's reviews come from (Judge.me, Google,
 * Yelp) and who may write one. Server: backend/app/api/v1/admin/review_sources.py.
 * The Judge.me token goes up once and never comes back; only a hint of it does.
 */
import { apiClient } from "@/lib/api-client";

export interface ReviewRules { who: "signed_in" | "buyers"; hold: boolean }

export interface JudgeMeStatus {
  connected: boolean;
  shop_domain?: string;
  shop_name?: string;
  token_hint?: string;
  connected_at?: string;
  last_synced_at?: string | null;
  last_attempt_at?: string | null;
  last_error?: string | null;
  imported?: number;
  store_reviews?: number;
  unmatched?: number;
  unmatched_handles?: string[];
  complete?: boolean;
}

export interface GooglePlaceFound {
  place_id: string; name: string; address: string; rating: number | null; total: number | null; maps_url: string | null;
}

export interface GooglePlaceStatus {
  configured: boolean;
  place_id?: string;
  saved_at?: string;
  place: (GooglePlaceFound & { reviews: unknown[] }) | null;
  error: string | null;
}

export interface YelpReview { id: string; alias: string; author: string | null; author_url: string | null; review_url: string; business: string | null }
export interface YelpStatus { url?: string | null; alias?: string | null; reviews?: YelpReview[]; saved_at?: string }

export interface ReviewSources {
  rules: ReviewRules;
  judgeme: JudgeMeStatus;
  google_place: GooglePlaceStatus;
  yelp: YelpStatus;
  /** Reviews in the shop by source: shown and hidden. */
  counts: Record<string, { shown: number; hidden: number }>;
}

export interface JudgeMeResult {
  added: number; updated: number; removed: number; imported: number; store_reviews: number;
  unmatched: number; unmatched_handles: string[]; complete: boolean;
}

const BASE = "/api/v1/admin/review-sources";

export const reviewSourcesService = {
  overview: () => apiClient.get<ReviewSources>(BASE),
  saveRules: (rules: ReviewRules) => apiClient.put<ReviewRules>(`${BASE}/rules`, rules),
  connectJudgeMe: (shop_domain: string, api_token: string) =>
    apiClient.post<ReviewSources & { synced: boolean; message?: string; result?: JudgeMeResult }>(
      `${BASE}/judgeme`, { shop_domain, api_token: api_token || null }),
  syncJudgeMe: () => apiClient.post<ReviewSources & { result: JudgeMeResult }>(`${BASE}/judgeme/sync`, {}),
  disconnectJudgeMe: (keepReviews = false) =>
    apiClient.delete<ReviewSources & { removed: number }>(`${BASE}/judgeme${keepReviews ? "?keep_reviews=true" : ""}`),
  searchGoogle: (q: string) =>
    apiClient.get<{ places: GooglePlaceFound[] }>(`${BASE}/google/search?q=${encodeURIComponent(q)}`),
  chooseGoogle: (place_id: string) => apiClient.put<ReviewSources>(`${BASE}/google`, { place_id }),
  removeGoogle: () => apiClient.delete<ReviewSources>(`${BASE}/google`),
  /** `keep`: ids of reviews already saved that stay. `add`: new embed codes or review links. */
  saveYelp: (url: string, keep: string[], add: string[]) =>
    apiClient.put<ReviewSources>(`${BASE}/yelp`, { url: url || null, keep, add }),
  removeYelp: () => apiClient.delete<ReviewSources>(`${BASE}/yelp`),
};
