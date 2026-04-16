import type {
  BackorderRow,
  BuildCreateBody,
  BuildDetail,
  BuildListResponse,
  CategoryItem,
  DraftCompleteBody,
  DraftCompleteResponse,
  FixedCost,
  FixedCostUpdate,
  ItemGroupListResponse,
  ProductHealthRow,
  ProductItem,
  ProfitTransaction,
  ProfitValuationRow,
  StockLotForProduct,
  ShelfCreateBody,
  ShelfCreateResponse,
  ShelfOccupancy,
  ShelfPatchBody,
  ShelfPatchResponse,
  VatRate,
  VatRateCreate,
  XrefListResponse,
  Zone,
  ZoneCreateBody,
  ZoneCreateResponse,
} from "./types";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown, message: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function extractMessage(detail: unknown, res: Response): string {
  if (detail && typeof detail === "object" && "detail" in detail) {
    const d = (detail as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((item) => {
          if (!item || typeof item !== "object") return String(item);
          const loc = "loc" in item ? (item as { loc?: unknown[] }).loc : undefined;
          const msg = "msg" in item ? (item as { msg?: unknown }).msg : undefined;
          const locStr = Array.isArray(loc) ? loc.join(".") : "";
          return locStr ? `${locStr}: ${msg ?? ""}` : String(msg ?? JSON.stringify(item));
        })
        .join("; ");
    }
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, detail, extractMessage(detail, res));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  auth: {
    me: () => request<{ user_id: string }>(`/api/auth/me`),
    login: async (username: string, password: string) => {
      const form = new FormData();
      form.set("username", username);
      form.set("password", password);
      const res = await fetch(`/api/auth/login`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        let detail: unknown = null;
        try {
          detail = await res.json();
        } catch {
          detail = await res.text().catch(() => null);
        }
        throw new ApiError(res.status, detail, extractMessage(detail, res));
      }
      return (await res.json()) as { ok: true };
    },
    logout: () =>
      request<{ ok: true }>(`/api/auth/logout`, { method: "POST" }),
  },
  builds: {
    list: (
      params: {
        include_auto?: boolean;
        draft_only?: boolean;
        page?: number;
        per_page?: number;
      } = {}
    ) => {
      const q = new URLSearchParams();
      if (params.include_auto) q.set("include_auto", "true");
      if (params.draft_only) q.set("draft_only", "true");
      if (params.page) q.set("page", String(params.page));
      if (params.per_page) q.set("per_page", String(params.per_page));
      const qs = q.toString();
      return request<BuildListResponse>(`/api/builds${qs ? `?${qs}` : ""}`);
    },
    get: (buildCode: string) =>
      request<BuildDetail>(`/api/builds/${encodeURIComponent(buildCode)}`),
    create: (body: BuildCreateBody) =>
      request<BuildDetail>(`/api/builds`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    replaceComponents: (buildCode: string, body: BuildCreateBody) =>
      request<{ build_code: string; components: BuildDetail["components"] }>(
        `/api/builds/${encodeURIComponent(buildCode)}`,
        { method: "PUT", body: JSON.stringify(body) }
      ),
    updateMeta: (buildCode: string, body: { name?: string | null; description?: string | null }) =>
      request<Pick<BuildDetail, "id" | "build_code" | "name" | "description" | "is_auto_generated" | "is_active">>(
        `/api/builds/${encodeURIComponent(buildCode)}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    completeDraft: (buildCode: string, body: DraftCompleteBody) =>
      request<DraftCompleteResponse>(
        `/api/builds/${encodeURIComponent(buildCode)}/complete-draft`,
        { method: "POST", body: JSON.stringify(body) }
      ),
    remove: (buildCode: string) =>
      request<{ ok: true }>(`/api/builds/${encodeURIComponent(buildCode)}`, {
        method: "DELETE",
      }),
  },
  zones: {
    list: () => request<Zone[]>(`/api/zones`),
    create: (body: ZoneCreateBody) =>
      request<ZoneCreateResponse>(`/api/zones`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    patch: (zoneId: string, body: { name?: string; is_active?: boolean }) =>
      request<{ id: string; name: string; is_active: boolean }>(
        `/api/zones/${encodeURIComponent(zoneId)}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    remove: (zoneId: string) =>
      request<{ ok: true; deleted_shelves: number }>(
        `/api/zones/${encodeURIComponent(zoneId)}`,
        { method: "DELETE" }
      ),
    createShelf: (zoneId: string, body: ShelfCreateBody) =>
      request<ShelfCreateResponse>(
        `/api/zones/${encodeURIComponent(zoneId)}/shelves`,
        { method: "POST", body: JSON.stringify(body) }
      ),
  },
  shelves: {
    occupancy: () => request<ShelfOccupancy[]>(`/api/shelves/occupancy`),
    patch: (shelfId: string, body: ShelfPatchBody) =>
      request<ShelfPatchResponse>(`/api/shelves/${encodeURIComponent(shelfId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (shelfId: string) =>
      request<{ ok: true }>(`/api/shelves/${encodeURIComponent(shelfId)}`, {
        method: "DELETE",
      }),
  },
  products: {
    list: (params: { q?: string; composite?: "true" | "false" } = {}) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      if (params.composite) qs.set("composite", params.composite);
      const s = qs.toString();
      return request<ProductItem[]>(`/api/products${s ? `?${s}` : ""}`);
    },
    create: (body: {
      ean: string;
      name: string;
      sku?: string | null;
      description?: string | null;
      minimum_stock?: number;
      avg_delivery_days?: number | null;
      avg_sold_per_day?: number | null;
      category_id?: string | null;
    }) =>
      request<{ id: string; ean: string; name: string }>(`/api/products`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      ean: string,
      body: {
        name?: string | null;
        sku?: string | null;
        description?: string | null;
        minimum_stock?: number | null;
        avg_delivery_days?: number | null;
        avg_sold_per_day?: number | null;
        category_id?: string | null;
      }
    ) =>
      request<{ id: string; ean: string; name: string }>(
        `/api/products/${encodeURIComponent(ean)}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    remove: (ean: string) =>
      request<void>(`/api/products/${encodeURIComponent(ean)}`, {
        method: "DELETE",
      }),
    health: () => request<ProductHealthRow[]>(`/api/products/health`),
  },
  itemGroups: {
    list: (params: { page?: number; per_page?: number } = {}) => {
      const qs = new URLSearchParams();
      if (params.page) qs.set("page", String(params.page));
      if (params.per_page) qs.set("per_page", String(params.per_page));
      const s = qs.toString();
      return request<ItemGroupListResponse>(`/api/item-groups${s ? `?${s}` : ""}`);
    },
  },
  categories: {
    list: () => request<CategoryItem[]>(`/api/categories`),
    create: (body: { name: string; description?: string }) =>
      request<{ id: string; name: string }>(`/api/categories`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: { name?: string; description?: string }) =>
      request<CategoryItem>(`/api/categories/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      request<void>(`/api/categories/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },
  xref: {
    list: (params: { marketplace?: string; build_code?: string; page?: number; per_page?: number } = {}) => {
      const q = new URLSearchParams();
      if (params.marketplace) q.set("marketplace", params.marketplace);
      if (params.build_code) q.set("build_code", params.build_code);
      if (params.page) q.set("page", String(params.page));
      if (params.per_page) q.set("per_page", String(params.per_page));
      const qs = q.toString();
      return request<XrefListResponse>(`/api/external-xref${qs ? `?${qs}` : ""}`);
    },
    create: (body: { marketplace: string; external_sku: string; build_code: string }) =>
      request(`/api/external-xref`, { method: "POST", body: JSON.stringify(body) }),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/external-xref/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },
  ingestion: {
    backorders: () =>
      request<BackorderRow[]>(`/api/health/ingestion/backorders`),
  },
  profit: {
    transactions: (params: { limit?: number; offset?: number } = {}) => {
      const q = new URLSearchParams();
      if (params.limit) q.set("limit", String(params.limit));
      if (params.offset) q.set("offset", String(params.offset));
      const qs = q.toString();
      return request<ProfitTransaction[]>(
        `/api/profit/transactions${qs ? `?${qs}` : ""}`
      );
    },
    valuation: () => request<ProfitValuationRow[]>(`/api/profit/valuation`),
    pollNow: () =>
      request<{ ok: true } | Record<string, unknown>>(`/api/poll-now`, {
        method: "POST",
      }),
  },
  stockLots: {
    byProduct: (ean: string) =>
      request<StockLotForProduct[]>(
        `/api/stock-lots/by-product/${encodeURIComponent(ean)}`
      ),
    create: (body: {
      ean: string;
      quantity: number;
      unit_cost: number;
      marketplace?: string;
      shelf_id?: string;
    }) =>
      request<{ id: string; ok: true }>(`/api/stock-lots`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    consume: (lotId: string, body: { qty: number; notes?: string }) =>
      request<{ lot_id: string; remaining: number; qty_consumed: number }>(
        `/api/stock-lots/${encodeURIComponent(lotId)}/consume`,
        { method: "POST", body: JSON.stringify(body) }
      ),
    transfer: (body: {
      lot_id: string;
      to_shelf_id: string;
      qty: number;
      notes?: string;
    }) =>
      request<{ source_lot_id: string; dest_lot_id: string; qty: number }>(
        `/api/stock/transfer`,
        { method: "POST", body: JSON.stringify(body) }
      ),
  },
  fixedCosts: {
    list: () => request<FixedCost[]>(`/api/fixed-costs`),
    update: (id: string, body: FixedCostUpdate) =>
      request<{ ok: true }>(`/api/fixed-costs/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },
  vatRates: {
    list: () => request<VatRate[]>(`/api/vat-rates`),
    update: (id: string, rate: number) =>
      request<VatRate>(`/api/vat-rates/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ rate }),
      }),
    create: (body: VatRateCreate) =>
      request<VatRate>(`/api/vat-rates`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
};
