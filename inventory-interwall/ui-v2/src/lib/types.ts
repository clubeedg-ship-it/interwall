// Types mirror backend contract in apps/api/routers/builds.py, external_xref.py,
// zones.py, shelves.py. Keep XOR semantics explicit — UI must never send both ids.

// -- Zones --------------------------------------------------------------------

export interface Zone {
  id: string;
  name: string;
  cols: number;
  levels: number;
  shelves_count: number;
}

export interface ZoneTemplate {
  cols: number;
  levels: number;
  split_bins: boolean;
  single_bin_cols: number[];
  default_capacity: number | null;
}

export interface ZoneCreateBody {
  name: string;
  is_active?: boolean;
  template?: ZoneTemplate;
}

export interface ZoneCreateResponse extends Zone {
  is_active: boolean;
  template_applied?: ZoneTemplate;
}

// -- Shelves / occupancy ------------------------------------------------------

export type BinLetter = "A" | "B" | null;

export interface ShelfOccupancy {
  shelf_id: string;
  shelf_label: string;
  zone_name: string;
  col: number;
  level: number;
  bin: BinLetter;
  capacity: number | null;
  total_qty: number;
  total_value: number;
  batch_count: number;
  product_name: string | null;
  product_ean: string | null;
  split_fifo: boolean;
  single_bin: boolean;
}

export interface ShelfPatchBody {
  capacity?: number | null;
  split_fifo?: boolean;
  single_bin?: boolean;
}

export interface ShelfPatchResponse {
  shelf_id: string;
  capacity: number | null;
  split_fifo: boolean;
  single_bin: boolean;
}

export interface ShelfCreateBody {
  col: number;
  level: number;
  bin?: BinLetter;
  capacity?: number | null;
  split_fifo?: boolean;
  single_bin?: boolean;
}

export interface ShelfCreateResponse {
  id: string;
  zone_id: string;
  col: number;
  level: number;
  bin: BinLetter;
  label: string;
  capacity: number | null;
  split_fifo: boolean;
  single_bin: boolean;
}

// -- Builds (existing) --------------------------------------------------------

export type SourceType = "item_group" | "product";

export interface BuildListItem {
  id: string;
  build_code: string;
  name: string | null;
  description: string | null;
  is_auto_generated: boolean;
  is_active: boolean;
  created_at: string;
  component_count: number;
  item_group_component_count: number;
  product_component_count: number;
  is_draft: boolean;
  draft_marketplace: string | null;
  draft_external_sku: string | null;
}

export interface BuildListResponse {
  items: BuildListItem[];
  total: number;
  page: number;
  per_page: number;
  draft_count: number;
}

export interface DraftMetadata {
  marketplace: string | null;
  external_sku: string | null;
  parsed_descriptions: string[];
  pending_review_count: number;
}

export interface DraftReplaySummary {
  candidates: number;
  processed: number;
  review: number;
  failed: number;
  dead_letter: number;
  skipped: number;
}

interface BuildComponentBase {
  id: string;
  quantity: number;
  valid_from: string;
  valid_to: string;
}

export interface ItemGroupComponent extends BuildComponentBase {
  source_type: "item_group";
  item_group_id: string;
  product_id: null;
  item_group_name: string | null;
  item_group_code: string | null;
  product_name: null;
  product_ean: null;
  product_sku: null;
}

export interface ProductComponent extends BuildComponentBase {
  source_type: "product";
  item_group_id: null;
  product_id: string;
  item_group_name: null;
  item_group_code: null;
  product_name: string | null;
  product_ean: string | null;
  product_sku: string | null;
}

export type BuildComponent = ItemGroupComponent | ProductComponent;

export interface BuildDetail {
  id: string;
  build_code: string;
  name: string | null;
  description: string | null;
  is_auto_generated: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  components: BuildComponent[];
  draft_metadata: DraftMetadata | null;
}

export type ComponentInput =
  | {
      source_type: "item_group";
      item_group_id: string;
      quantity: number;
      valid_from?: string | null;
      valid_to?: string | null;
    }
  | {
      source_type: "product";
      product_id: string;
      quantity: number;
      valid_from?: string | null;
      valid_to?: string | null;
    };

export interface BuildCreateBody {
  build_code?: string | null;
  name?: string | null;
  description?: string | null;
  components?: ComponentInput[];
}

export interface DraftCompleteBody {
  name?: string | null;
  description?: string | null;
  components: ComponentInput[];
  replay?: boolean;
}

export interface DraftCompleteResponse {
  build_code: string;
  name: string | null;
  description: string | null;
  is_active: boolean;
  replay: DraftReplaySummary;
}

export interface XrefItem {
  id: string;
  marketplace: string;
  external_sku: string;
  build_code: string;
  build_name: string | null;
  is_auto_generated: boolean;
  created_at: string;
}

export interface XrefListResponse {
  items: XrefItem[];
  total: number;
  page: number;
  per_page: number;
}

// -- Library (products + item_groups + categories) ---------------------------

export interface ProductItem {
  id: string;
  ean: string;
  name: string;
  sku: string | null;
  is_composite: boolean;
  minimum_stock: number | null;
  avg_delivery_days: number | null;
  avg_sold_per_day: number | null;
  category_id: string | null;
  category_name: string | null;
  description: string | null;
}

export type HealthTier = "healthy" | "warning" | "critical" | "empty";

export interface ProductHealthRow {
  ean: string;
  total_qty: number;
  reorder_point: number;
  computed_reorder_point: number | null;
  minimum_stock: number;
  health: HealthTier;
}

export interface ItemGroupItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ItemGroupListResponse {
  items: ItemGroupItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
}

// -- Profit (transactions, valuation, fixed costs, VAT) ----------------------

export interface ProfitTransactionComponent {
  component_name: string;
  component_ean: string;
  quantity: number;
  cost: number;
}

export interface ProfitTransactionFixedCost {
  name: string;
  value: number;
  is_percentage: boolean;
  amount: number;
  country?: string;
}

export interface ProfitTransaction {
  id: string;
  type: string;
  product_ean: string;
  product_name: string | null;
  quantity: number;
  unit_price: string | number;
  total_price: string | number;
  marketplace: string | null;
  order_reference: string | null;
  cogs: string | number | null;
  profit: string | number | null;
  created_at: string;
  components: ProfitTransactionComponent[];
  fixed_costs: ProfitTransactionFixedCost[];
}

export interface ProfitValuationRow {
  ean: string;
  name: string | null;
  total_qty: string | number;
  total_value: string | number;
}

export interface StockLotForProduct {
  id: string;
  quantity: number;
  unit_cost: string | number;
  marketplace: string | null;
  received_at: string;
  created_at: string;
  shelf_id: string | null;
  shelf_label: string | null;
  zone_name: string | null;
}

export interface FixedCost {
  id: string;
  name: string;
  value: string | number;
  is_percentage: boolean;
  updated_at: string;
}

export interface FixedCostUpdate {
  value: number;
  is_percentage: boolean;
}

export interface VatRate {
  id: string;
  marketplace: string;
  country: string;
  rate: string | number;
  updated_at: string;
}

export interface VatRateCreate {
  marketplace: string;
  country: string;
  rate: number;
}
