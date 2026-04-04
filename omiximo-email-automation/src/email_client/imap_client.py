"""
IMAP Client for connecting to email server and fetching emails.
"""

import imaplib
import email
from email.header import decode_header
from email.message import Message
from typing import Optional
import logging

from src.config import Config

logger = logging.getLogger(__name__)


class IMAPClient:
    """IMAP client for fetching emails from Hostnet."""

    def __init__(self):
        self.server = Config.IMAP_SERVER
        self.port = Config.IMAP_PORT
        self.email_address = Config.IMAP_EMAIL
        self.use_ssl = Config.IMAP_USE_SSL
        self.connection: Optional[imaplib.IMAP4_SSL] = None

    def connect(self) -> bool:
        """
        Connect to the IMAP server.

        Returns:
            True if connection successful.

        Raises:
            ConnectionError: If connection fails.
        """
        try:
            password = Config.get_email_password()

            if self.use_ssl:
                self.connection = imaplib.IMAP4_SSL(self.server, self.port)
            else:
                self.connection = imaplib.IMAP4(self.server, self.port)

            self.connection.login(self.email_address, password)
            logger.info(f"Connected to {self.server} as {self.email_address}")
            return True

        except imaplib.IMAP4.error as e:
            logger.error(f"IMAP login failed: {e}")
            raise ConnectionError(f"Failed to connect to {self.server}: {e}")

    def disconnect(self):
        """Disconnect from the IMAP server."""
        if self.connection:
            try:
                self.connection.logout()
                logger.info("Disconnected from IMAP server")
            except Exception as e:
                logger.warning(f"Error during disconnect: {e}")
            finally:
                self.connection = None

    def select_inbox(self) -> int:
        """
        Select the INBOX folder.

        Returns:
            Number of messages in inbox.
        """
        if not self.connection:
            raise ConnectionError("Not connected to IMAP server")

        status, data = self.connection.select("INBOX")
        if status != "OK":
            raise ConnectionError(f"Failed to select INBOX: {data}")

        message_count = int(data[0])
        logger.debug(f"INBOX selected, {message_count} messages")
        return message_count

    def search_from_sender(
        self, 
        sender_email: str, 
        unseen_only: bool = True,
        since_hours: int = None
    ) -> list:
        """
        Search for emails from a specific sender.

        Args:
            sender_email: Email address of the sender.
            unseen_only: If True, only return unread emails.
            since_hours: If provided, only return emails from the last N hours.

        Returns:
            List of email UIDs matching the criteria.
        """
        if not self.connection:
            raise ConnectionError("Not connected to IMAP server")

        # Build search criteria
        criteria_parts = [f'FROM "{sender_email}"']
        
        if unseen_only:
            criteria_parts.append("UNSEEN")
        
        if since_hours is not None:
            from datetime import datetime, timedelta
            # IMAP SINCE uses date only (not time), format: DD-Mon-YYYY
            since_date = datetime.now() - timedelta(hours=since_hours)
            date_str = since_date.strftime("%d-%b-%Y")
            criteria_parts.append(f'SINCE {date_str}')
        
        criteria = "(" + " ".join(criteria_parts) + ")"
        logger.debug(f"IMAP search criteria: {criteria}")

        status, data = self.connection.search(None, criteria)
        if status != "OK":
            logger.warning(f"Search failed: {data}")
            return []

        email_ids = data[0].split()
        logger.info(f"Found {len(email_ids)} emails from {sender_email}")
        return email_ids

    def fetch_email(self, email_id: bytes) -> Optional[dict]:
        """
        Fetch and parse a single email by ID.

        Args:
            email_id: The email UID to fetch.

        Returns:
            Dictionary with email data or None if fetch fails.
        """
        if not self.connection:
            raise ConnectionError("Not connected to IMAP server")

        status, data = self.connection.fetch(email_id, "(RFC822)")
        if status != "OK":
            logger.warning(f"Failed to fetch email {email_id}")
            return None

        raw_email = data[0][1]
        msg = email.message_from_bytes(raw_email)

        # Decode subject
        subject = ""
        if msg["Subject"]:
            decoded_parts = decode_header(msg["Subject"])
            subject = "".join(
                part.decode(encoding or "utf-8") if isinstance(part, bytes) else part
                for part, encoding in decoded_parts
            )

        # Decode from
        from_addr = msg.get("From", "")
        if from_addr:
            decoded_parts = decode_header(from_addr)
            from_addr = "".join(
                part.decode(encoding or "utf-8") if isinstance(part, bytes) else part
                for part, encoding in decoded_parts
            )

        # Get body
        body = self._get_email_body(msg)

        # Get Message-ID for tracking
        message_id = msg.get("Message-ID", "")

        return {
            "id": email_id.decode() if isinstance(email_id, bytes) else str(email_id),
            "message_id": message_id,
            "subject": subject,
            "from": from_addr,
            "date": msg.get("Date", ""),
            "body": body,
        }

    def _get_email_body(self, msg: Message) -> str:
        """
        Extract the text body from an email message.

        Args:
            msg: Email message object.

        Returns:
            Plain text body of the email.
        """
        body = ""

        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition", ""))

                # Skip attachments
                if "attachment" in content_disposition:
                    continue

                if content_type == "text/plain":
                    try:
                        charset = part.get_content_charset() or "utf-8"
                        payload = part.get_payload(decode=True)
                        if payload:
                            body = payload.decode(charset, errors="replace")
                            break
                    except Exception as e:
                        logger.warning(f"Error decoding email part: {e}")

            # If no plain text found, try HTML
            if not body:
                for part in msg.walk():
                    if part.get_content_type() == "text/html":
                        try:
                            charset = part.get_content_charset() or "utf-8"
                            payload = part.get_payload(decode=True)
                            if payload:
                                body = payload.decode(charset, errors="replace")
                                break
                        except Exception as e:
                            logger.warning(f"Error decoding HTML part: {e}")
        else:
            try:
                charset = msg.get_content_charset() or "utf-8"
                payload = msg.get_payload(decode=True)
                if payload:
                    body = payload.decode(charset, errors="replace")
            except Exception as e:
                logger.warning(f"Error decoding email body: {e}")

        return body

    def mark_as_read(self, email_id: bytes):
        """
        Mark an email as read.

        Args:
            email_id: The email UID to mark as read.
        """
        if not self.connection:
            raise ConnectionError("Not connected to IMAP server")

        self.connection.store(email_id, "+FLAGS", "\\Seen")
        logger.debug(f"Marked email {email_id} as read")

    def __enter__(self):
        """Context manager entry."""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.disconnect()
