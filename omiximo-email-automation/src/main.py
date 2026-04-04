#!/usr/bin/env python3
"""
Omiximo Email-to-Inventory Automation

Main application that:
1. Connects to IMAP server
2. Monitors for marketplace sale emails
3. Parses order data
4. Records sales and deducts inventory
"""

import sys
import time
import signal
import logging
from typing import Optional

from config import Config
from email_client import IMAPClient
from marketplace_parsers import MediaMarktSaturnParser, BolComParser, BoulangerParser, OrderData
from inventory import InvenTreeClient, StockManager
from utils import ProcessedEmailTracker
from vat_rates import calculate_net_price, get_vat_rate

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("omiximo")


class EmailAutomation:
    """Main email automation application."""

    def __init__(self):
        self.running = False
        self.email_client: Optional[IMAPClient] = None
        self.inventree_client: Optional[InvenTreeClient] = None
        self.stock_manager: Optional[StockManager] = None
        self.tracker: Optional[ProcessedEmailTracker] = None

        # Register parsers
        self.parsers = [
            MediaMarktSaturnParser(),
            BolComParser(),
            BoulangerParser(),
        ]

        # Signal handling
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGTERM, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        """Handle shutdown signals gracefully."""
        logger.info("Shutdown signal received, stopping...")
        self.running = False

    def initialize(self) -> bool:
        """
        Initialize all components.

        Returns:
            True if initialization successful.
        """
        logger.info("Initializing Omiximo Email Automation...")

        # Validate configuration
        try:
            Config.validate()
        except ValueError as e:
            logger.error(f"Configuration error: {e}")
            return False

        # Initialize tracker
        self.tracker = ProcessedEmailTracker()
        logger.info(f"Loaded {self.tracker.get_processed_count()} processed emails")

        # Initialize InvenTree client
        self.inventree_client = InvenTreeClient()
        if not self.inventree_client.authenticate():
            logger.error("Failed to authenticate with InvenTree")
            return False

        if not self.inventree_client.test_connection():
            logger.error("Failed to connect to InvenTree API")
            return False

        logger.info("Connected to InvenTree API")

        # Initialize stock manager
        self.stock_manager = StockManager(self.inventree_client)

        # Test email connection
        try:
            self.email_client = IMAPClient()
            self.email_client.connect()
            self.email_client.select_inbox()
            self.email_client.disconnect()
            logger.info("Email connection test successful")
        except Exception as e:
            logger.error(f"Failed to connect to email server: {e}")
            return False

        logger.info("Initialization complete")
        return True

    def process_email(self, email_data: dict) -> bool:
        """
        Process a single email.

        Args:
            email_data: Email data dictionary.

        Returns:
            True if processed successfully.
        """
        message_id = email_data.get("message_id", "")
        subject = email_data.get("subject", "")

        # Check if already processed
        if self.tracker.is_processed(message_id):
            logger.debug(f"Skipping already processed: {subject[:50]}")
            return False

        # Find matching parser
        parser = None
        for p in self.parsers:
            if p.can_parse(email_data):
                parser = p
                break

        if not parser:
            logger.debug(f"No parser for email: {subject[:50]}")
            return False

        logger.info(f"Processing: {subject}")

        # Parse order data
        order = parser.parse(email_data)
        if not order:
            logger.warning(f"Failed to parse order from: {subject}")
            self.tracker.mark_processed(
                message_id=message_id,
                success=False,
                error="Failed to parse order",
            )
            return False

        # Calculate VAT based on shipping country
        country = order.shipping_address.country or "NL"
        net_price, vat_amount, vat_rate = calculate_net_price(order.price, country)
        
        logger.info(
            f"Parsed order {order.order_number}: "
            f"SKU={order.sku}, RAM={order.ram_size_gb}GB, "
            f"Qty={order.quantity}, Gross=€{order.price:.2f}, "
            f"VAT={vat_rate*100:.1f}% (€{vat_amount:.2f}), Net=€{net_price:.2f}, "
            f"Country={country}"
        )

        # Check stock availability
        available, issues = self.stock_manager.check_stock_availability(order)
        if not available:
            for issue in issues:
                logger.warning(f"Stock issue: {issue}")
            # Continue anyway - will deduct what's available

        # Process the order (deduct stock)
        results = self.stock_manager.process_order(order)

        # Check results
        all_success = all(r.success for r in results)
        errors = [r.error for r in results if r.error]

        if all_success:
            logger.info(
                f"Order {order.order_number} processed successfully. "
                f"Deductions: {[f'{r.sku}:{r.quantity_deducted}' for r in results]}"
            )
        else:
            logger.warning(
                f"Order {order.order_number} had issues: {errors}"
            )

        # Mark as processed
        self.tracker.mark_processed(
            message_id=message_id,
            order_number=order.order_number,
            sku=order.sku,
            success=all_success,
            error="; ".join(errors) if errors else "",
        )

        return all_success

    def check_emails(self) -> int:
        """
        Check for new marketplace emails and process them.

        Returns:
            Number of emails processed.
        """
        processed_count = 0

        try:
            with IMAPClient() as client:
                client.select_inbox()

                # Check each marketplace sender
                for name, sender in Config.MARKETPLACE_SENDERS.items():
                    logger.debug(f"Checking for emails from {name}")

                    email_ids = client.search_from_sender(
                        sender_email=sender,
                        unseen_only=True,
                    )

                    for email_id in email_ids:
                        email_data = client.fetch_email(email_id)
                        if email_data:
                            if self.process_email(email_data):
                                processed_count += 1
                            # Mark as read regardless of success
                            client.mark_as_read(email_id)

        except Exception as e:
            logger.error(f"Error checking emails: {e}")

        return processed_count

    def run(self):
        """Run the main processing loop."""
        if not self.initialize():
            logger.error("Initialization failed, exiting")
            sys.exit(1)

        self.running = True
        poll_interval = Config.POLL_INTERVAL

        logger.info(f"Starting email monitoring (poll interval: {poll_interval}s)")

        while self.running:
            try:
                processed = self.check_emails()
                if processed > 0:
                    logger.info(f"Processed {processed} orders")

            except Exception as e:
                logger.error(f"Error in main loop: {e}", exc_info=True)

            # Sleep with interrupt check
            for _ in range(poll_interval):
                if not self.running:
                    break
                time.sleep(1)

        logger.info("Email automation stopped")

    def run_once(self):
        """Run a single check (for testing/cron)."""
        if not self.initialize():
            logger.error("Initialization failed")
            return False

        processed = self.check_emails()
        logger.info(f"Single run complete: processed {processed} orders")
        return processed > 0


def main():
    """Entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Omiximo Email-to-Inventory Automation"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run once and exit (for cron jobs)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )

    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    app = EmailAutomation()

    if args.once:
        app.run_once()
    else:
        app.run()


if __name__ == "__main__":
    main()
