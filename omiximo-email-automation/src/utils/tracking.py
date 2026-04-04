"""
Tracking utility for processed emails.
Prevents duplicate processing of the same order.
"""

import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

from src.config import Config

logger = logging.getLogger(__name__)


class ProcessedEmailTracker:
    """Tracks which emails have been processed to avoid duplicates."""

    def __init__(self, file_path: Optional[Path] = None):
        self.file_path = file_path or Config.PROCESSED_FILE
        self.processed: dict = {}
        self._load()

    def _load(self):
        """Load processed emails from file."""
        try:
            if self.file_path.exists():
                with open(self.file_path, "r") as f:
                    self.processed = json.load(f)
                logger.debug(f"Loaded {len(self.processed)} processed emails")
        except Exception as e:
            logger.warning(f"Could not load processed emails: {e}")
            self.processed = {}

    def _save(self):
        """Save processed emails to file."""
        try:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.file_path, "w") as f:
                json.dump(self.processed, f, indent=2)
        except Exception as e:
            logger.error(f"Could not save processed emails: {e}")

    def is_processed(self, message_id: str) -> bool:
        """
        Check if an email has already been processed.

        Args:
            message_id: Email Message-ID header.

        Returns:
            True if already processed.
        """
        return message_id in self.processed

    def mark_processed(
        self,
        message_id: str,
        order_number: str = "",
        sku: str = "",
        success: bool = True,
        error: str = "",
    ):
        """
        Mark an email as processed.

        Args:
            message_id: Email Message-ID header.
            order_number: Extracted order number.
            sku: Product SKU.
            success: Whether processing was successful.
            error: Error message if failed.
        """
        self.processed[message_id] = {
            "processed_at": datetime.now().isoformat(),
            "order_number": order_number,
            "sku": sku,
            "success": success,
            "error": error,
        }
        self._save()
        logger.debug(f"Marked email {message_id[:20]}... as processed")

    def get_processed_count(self) -> int:
        """Get total number of processed emails."""
        return len(self.processed)

    def get_recent_orders(self, limit: int = 10) -> list[dict]:
        """
        Get recently processed orders.

        Args:
            limit: Maximum number of orders to return.

        Returns:
            List of recent order records.
        """
        sorted_items = sorted(
            self.processed.items(),
            key=lambda x: x[1].get("processed_at", ""),
            reverse=True,
        )
        return [
            {"message_id": k, **v}
            for k, v in sorted_items[:limit]
        ]

    def clear_old_entries(self, days: int = 90):
        """
        Remove entries older than specified days.

        Args:
            days: Number of days to keep.
        """
        cutoff = datetime.now().timestamp() - (days * 86400)
        to_remove = []

        for msg_id, data in self.processed.items():
            try:
                processed_at = datetime.fromisoformat(data.get("processed_at", ""))
                if processed_at.timestamp() < cutoff:
                    to_remove.append(msg_id)
            except (ValueError, TypeError):
                pass

        for msg_id in to_remove:
            del self.processed[msg_id]

        if to_remove:
            self._save()
            logger.info(f"Removed {len(to_remove)} old entries")
