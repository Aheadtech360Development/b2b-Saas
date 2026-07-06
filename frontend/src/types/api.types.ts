/** Standard API error response shape. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

/** Paginated list response wrapper. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

/** Generic API response with data. */
export interface ApiResponse<T> {
  data: T;
}

/** Filter and pagination query params. */
export interface PaginationParams {
  page?: number;
  per_page?: number;
  q?: string;
}
