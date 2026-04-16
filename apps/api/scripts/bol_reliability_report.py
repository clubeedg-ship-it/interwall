#!/usr/bin/env python3
"""
T-D04 helper: compare Bol.com email fallback vs API polling overlap.

Reads Bol.com rows from ingestion_events, normalizes them to a shared
order key, and reports whether the live-overlap gate is met:
  - 7 elapsed days from first comparable order, or
  - 50 distinct orders, whichever comes first.

Before the gate is met, it prints the exact remaining runtime gate.
When the gate is met, use the emitted markdown as the durable T-D04
reliability report.

Synthetic `B03LOCAL` harness rows are ignored by default so a historical
local dry-run cannot be mistaken for live overlap proof. Pass
`--include-synthetic` only when intentionally validating the helper.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
import os
import statistics
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import db


WINDOW_DAYS = 7
ORDER_THRESHOLD = 50
MARKETPLACE = "BolCom"
SOURCE_EMAIL = "email"
SOURCE_API = "bolcom_api"
PRICE_EPSILON = Decimal("0.01")


@dataclass
class EventRow:
    source: str
    status: str
    created_at: datetime
    processed_at: datetime | None
    order_key: str
    message_id: str | None
    external_id: str | None
    email_sku: str | None
    email_qty: int | None
    email_price: Decimal | None
    api_offer_reference: str | None
    api_ean: str | None
    api_qty: int | None
    api_total: Decimal | None


@dataclass
class OrderSummary:
    order_key: str
    first_seen_at: datetime
    email_rows: list[EventRow]
    api_rows: list[EventRow]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default=None,
        help="Write markdown report to this path when the gate is met.",
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=WINDOW_DAYS,
        help="Calendar window gate; defaults to 7 days.",
    )
    parser.add_argument(
        "--threshold-orders",
        type=int,
        default=ORDER_THRESHOLD,
        help="Distinct-order gate; defaults to 50 orders.",
    )
    parser.add_argument(
        "--include-synthetic",
        action="store_true",
        help="Include historical B03LOCAL harness rows. Disabled by default for T-D04 live proofing.",
    )
    return parser.parse_args()


def fetch_rows(include_synthetic: bool = False) -> list[EventRow]:
    sql = """
        SELECT
            source,
            status,
            created_at,
            processed_at,
            message_id,
            external_id,
            CASE
                WHEN source = 'email'
                    THEN NULLIF(parsed_data->>'order_number', '')
                WHEN source = 'bolcom_api'
                     AND external_id LIKE 'bol-%%'
                     AND parsed_data ? 'orderItemId'
                     AND RIGHT(external_id, LENGTH(parsed_data->>'orderItemId') + 1)
                         = '-' || (parsed_data->>'orderItemId')
                    THEN SUBSTR(
                        external_id,
                        5,
                        LENGTH(external_id) - LENGTH(parsed_data->>'orderItemId') - 5
                    )
                ELSE NULL
            END AS order_key,
            CASE
                WHEN source = 'email'
                    THEN NULLIF(parsed_data->>'sku', '')
                ELSE NULL
            END AS email_sku,
            CASE
                WHEN source = 'email' AND NULLIF(parsed_data->>'quantity', '') IS NOT NULL
                    THEN (parsed_data->>'quantity')::INTEGER
                ELSE NULL
            END AS email_qty,
            CASE
                WHEN source = 'email' AND NULLIF(parsed_data->>'price', '') IS NOT NULL
                    THEN (parsed_data->>'price')::NUMERIC
                ELSE NULL
            END AS email_price,
            CASE
                WHEN source = 'bolcom_api'
                    THEN NULLIF(parsed_data#>>'{offer,reference}', '')
                ELSE NULL
            END AS api_offer_reference,
            CASE
                WHEN source = 'bolcom_api'
                    THEN NULLIF(parsed_data#>>'{product,ean}', '')
                ELSE NULL
            END AS api_ean,
            CASE
                WHEN source = 'bolcom_api' AND NULLIF(parsed_data->>'quantity', '') IS NOT NULL
                    THEN (parsed_data->>'quantity')::INTEGER
                ELSE NULL
            END AS api_qty,
            CASE
                WHEN source = 'bolcom_api' AND NULLIF(parsed_data->>'totalPrice', '') IS NOT NULL
                    THEN (parsed_data->>'totalPrice')::NUMERIC
                ELSE NULL
            END AS api_total
        FROM ingestion_events
        WHERE marketplace = %s
          AND parsed_type = 'sale'
          AND source IN ('email', 'bolcom_api')
          AND (
                %s
                OR (
                    COALESCE(message_id, '') NOT LIKE 'B03LOCAL%%'
                    AND COALESCE(external_id, '') NOT LIKE 'bol-B03LOCAL%%'
                )
          )
        ORDER BY created_at, id
    """

    db.init_pool()
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (MARKETPLACE, include_synthetic))
            raw_rows = cur.fetchall()

    rows: list[EventRow] = []
    for row in raw_rows:
        order_key = row["order_key"]
        if not order_key:
            continue
        rows.append(
            EventRow(
                source=row["source"],
                status=row["status"],
                created_at=row["created_at"],
                processed_at=row["processed_at"],
                order_key=order_key,
                message_id=row["message_id"],
                external_id=row["external_id"],
                email_sku=row["email_sku"],
                email_qty=row["email_qty"],
                email_price=row["email_price"],
                api_offer_reference=row["api_offer_reference"],
                api_ean=row["api_ean"],
                api_qty=row["api_qty"],
                api_total=row["api_total"],
            )
        )
    return rows


def build_orders(rows: list[EventRow]) -> list[OrderSummary]:
    grouped: dict[str, OrderSummary] = {}
    for row in rows:
        summary = grouped.get(row.order_key)
        if summary is None:
            summary = OrderSummary(
                order_key=row.order_key,
                first_seen_at=row.created_at,
                email_rows=[],
                api_rows=[],
            )
            grouped[row.order_key] = summary
        else:
            summary.first_seen_at = min(summary.first_seen_at, row.created_at)

        if row.source == SOURCE_EMAIL:
            summary.email_rows.append(row)
        elif row.source == SOURCE_API:
            summary.api_rows.append(row)

    return sorted(grouped.values(), key=lambda order: (order.first_seen_at, order.order_key))


def quantize_money(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(PRICE_EPSILON)


def summarize_overlap(order: OrderSummary) -> dict[str, Any]:
    email_qty = sum((row.email_qty or 0) for row in order.email_rows)
    api_qty = sum((row.api_qty or 0) for row in order.api_rows)

    email_total = sum(
        (row.email_price or Decimal("0")) * Decimal(row.email_qty or 0)
        for row in order.email_rows
    )
    api_total = sum((row.api_total or Decimal("0")) for row in order.api_rows)

    email_first = min(row.created_at for row in order.email_rows)
    api_first = min(row.created_at for row in order.api_rows)
    delta_minutes = (api_first - email_first).total_seconds() / 60.0

    return {
        "order_key": order.order_key,
        "email_qty": email_qty,
        "api_qty": api_qty,
        "email_total": quantize_money(email_total),
        "api_total": quantize_money(api_total),
        "qty_mismatch": email_qty != api_qty,
        "value_mismatch": abs(email_total - api_total) > PRICE_EPSILON,
        "delta_minutes": delta_minutes,
    }


def minutes_label(value: float) -> str:
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.1f} min"


def format_timedelta(delta: timedelta) -> str:
    total_seconds = int(delta.total_seconds())
    if total_seconds <= 0:
        return "0h 0m"
    hours, remainder = divmod(total_seconds, 3600)
    minutes = remainder // 60
    return f"{hours}h {minutes}m"


def render_report(
    orders: list[OrderSummary],
    selected_orders: list[OrderSummary],
    gate_met: bool,
    gate_reason: str,
    comparison_end: datetime | None,
    now_utc: datetime,
    window_days: int,
    threshold_orders: int,
) -> str:
    lines: list[str] = []
    lines.append("# T-D04 Bol.com Ingestion Overlap Report")
    lines.append("")
    lines.append(f"- Generated at: {now_utc.isoformat()}")
    lines.append("- Reliability objective: zero email-only orders, zero API-only orders, and zero quantity/value mismatches inside the comparison window.")

    if not orders:
        lines.append("- Comparison window analyzed: no comparable Bol.com email/API data in `ingestion_events` yet.")
        lines.append(f"- Distinct Bol.com orders observed: 0 / {threshold_orders}")
        lines.append("- Orders seen by email only: 0")
        lines.append("- Orders seen by API only: 0")
        lines.append("- Orders seen by both: 0")
        lines.append("- Timing differences: not derivable")
        lines.append("- Field mismatches: not derivable")
        lines.append("- Exit decision: not ready to close `T-D04`.")
        lines.append(
            "- Remaining gate: start the parallel run and accumulate either "
            f"{threshold_orders} distinct Bol.com orders or {window_days} elapsed days, whichever comes first."
        )
        return "\n".join(lines) + "\n"

    start = orders[0].first_seen_at
    selected_count = len(selected_orders)
    email_only = 0
    api_only = 0
    both = 0
    overlap_stats: list[dict[str, Any]] = []

    for order in selected_orders:
        has_email = bool(order.email_rows)
        has_api = bool(order.api_rows)
        if has_email and has_api:
            both += 1
            overlap_stats.append(summarize_overlap(order))
        elif has_email:
            email_only += 1
        elif has_api:
            api_only += 1

    end_label = comparison_end.isoformat() if comparison_end else "n/a"
    lines.append(
        f"- Comparison window analyzed: {start.isoformat()} to {end_label} "
        f"({selected_count} distinct orders; gate {gate_reason})"
    )
    lines.append(f"- Distinct Bol.com orders observed in window: {selected_count}")
    lines.append(f"- Orders seen by email only: {email_only}")
    lines.append(f"- Orders seen by API only: {api_only}")
    lines.append(f"- Orders seen by both: {both}")

    if overlap_stats:
        deltas = [item["delta_minutes"] for item in overlap_stats]
        api_first = sum(1 for value in deltas if value < 0)
        email_first = sum(1 for value in deltas if value > 0)
        same_minute = sum(1 for value in deltas if value == 0)
        lines.append(
            "- Timing differences: "
            f"median {minutes_label(statistics.median(deltas))}; "
            f"max absolute {max(abs(value) for value in deltas):.1f} min; "
            f"API first on {api_first}, email first on {email_first}, same-minute on {same_minute}."
        )

        qty_mismatches = [item for item in overlap_stats if item["qty_mismatch"]]
        value_mismatches = [item for item in overlap_stats if item["value_mismatch"]]
        lines.append(
            "- Field mismatches: "
            f"{len(qty_mismatches)} quantity mismatches; "
            f"{len(value_mismatches)} gross-value mismatches."
        )

        mismatch_examples = []
        for item in qty_mismatches[:3]:
            mismatch_examples.append(
                f"{item['order_key']} qty email={item['email_qty']} api={item['api_qty']}"
            )
        for item in value_mismatches[:3]:
            mismatch_examples.append(
                f"{item['order_key']} value email={item['email_total']} api={item['api_total']}"
            )
        if mismatch_examples:
            lines.append(f"- Mismatch examples: {'; '.join(mismatch_examples[:5])}.")
    else:
        lines.append("- Timing differences: not derivable (no orders seen by both paths in the comparison window).")
        lines.append("- Field mismatches: not derivable (no orders seen by both paths in the comparison window).")

    if gate_met:
        ready = email_only == 0 and api_only == 0
        lines.append(
            f"- Exit decision: {'ready' if ready else 'not ready'} to close `T-D04`."
        )
        if ready:
            lines.append("- Remaining gate: none; `T-B03` can be treated as production-complete and the emergency email fallback can be retired by policy.")
        else:
            lines.append(
                "- Remaining gate: zero missed orders is not yet satisfied; "
                "all orders in the comparison window must appear on both paths."
            )
    else:
        remaining_orders = max(0, threshold_orders - len(orders))
        remaining_time = (start + timedelta(days=window_days)) - now_utc
        lines.append("- Exit decision: not ready to close `T-D04`.")
        lines.append(
            "- Remaining gate: need either "
            f"{remaining_orders} more distinct Bol.com orders or "
            f"{format_timedelta(remaining_time)} more elapsed runtime "
            f"(until {(start + timedelta(days=window_days)).isoformat()}), whichever comes first."
        )

    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    rows = fetch_rows(include_synthetic=args.include_synthetic)
    orders = build_orders(rows)
    now_utc = datetime.now(timezone.utc)

    if not orders:
        report = render_report(
            orders=[],
            selected_orders=[],
            gate_met=False,
            gate_reason="not started",
            comparison_end=None,
            now_utc=now_utc,
            window_days=args.window_days,
            threshold_orders=args.threshold_orders,
        )
        print(report, end="")
        return 1

    start = orders[0].first_seen_at
    threshold_time = None
    if len(orders) >= args.threshold_orders:
        threshold_time = orders[args.threshold_orders - 1].first_seen_at
    seven_day_end = start + timedelta(days=args.window_days)

    gate_met = False
    gate_reason = "pending"
    comparison_end = now_utc
    if threshold_time is not None and threshold_time <= seven_day_end and threshold_time <= now_utc:
        gate_met = True
        gate_reason = f"{args.threshold_orders}-order threshold hit first"
        comparison_end = threshold_time
    elif now_utc >= seven_day_end:
        gate_met = True
        gate_reason = f"{args.window_days}-day window elapsed first"
        comparison_end = seven_day_end

    selected_orders = [order for order in orders if order.first_seen_at <= comparison_end]
    report = render_report(
        orders=orders,
        selected_orders=selected_orders,
        gate_met=gate_met,
        gate_reason=gate_reason,
        comparison_end=comparison_end,
        now_utc=now_utc,
        window_days=args.window_days,
        threshold_orders=args.threshold_orders,
    )

    if gate_met and args.output:
        output_path = Path(args.output)
        output_path.write_text(report, encoding="utf-8")

    print(report, end="")
    return 0 if gate_met else 1


if __name__ == "__main__":
    raise SystemExit(main())
