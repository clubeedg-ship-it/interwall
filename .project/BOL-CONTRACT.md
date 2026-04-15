# Bol.com Retailer API v10 — Webhook & Order Ingestion Contract

**Task:** T-B00
**Date:** 2026-04-15
**Sources:** Bol.com Retailer API v10 documentation at api.bol.com

---

## 0. Critical finding: webhooks do NOT deliver new orders

D-030 assumed Bol.com webhooks would deliver new customer orders.
**This is incorrect.** The subscription system supports only two
resource types over webhooks:

| Resource | Event types | What it tells you |
|---|---|---|
| `PROCESS_STATUS` | `SUCCESS`, `FAILURE`, `TIMEOUT` | Whether an async API call you made (e.g. confirm shipment) completed |
| `SHIPMENT` | `UPDATE_TRANSPORT_EVENT` | A shipment changed transport status |

Four additional resources exist but are **only available via GCP
Pub/Sub or AWS SQS**, not webhooks:

| Resource | Event type | Channel |
|---|---|---|
| `PRICE_STAR_BOUNDARY` | `CHANGE` | Pub/Sub, SQS only |
| `COMPETING_OFFER` | `CHANGE` | Pub/Sub, SQS only |
| `OFFER_FOR_SALE` | `FOR_SALE` | Pub/Sub, SQS only |
| `OFFER_NOT_FOR_SALE` | `NOT_FOR_SALE` | Pub/Sub, SQS only |

**New customer orders are retrieved by polling** the orders API
endpoint. Bol.com recommends polling every 5-15 minutes. This is the
only supported mechanism.

Source: https://api.bol.com/retailer/public/Retailer-API/v10/functional/retailer-api/subscriptions.html

---

## 1. Event catalogue

### Webhook-deliverable events

| Event name | Payload `event.resource` | Payload `event.type` | When fired | Idempotency key | Source |
|---|---|---|---|---|---|
| Process status success | `PROCESS_STATUS` | `SUCCESS` | Async API operation completed successfully | `event.resourceId` (= processStatusId) | subscriptions.html |
| Process status failure | `PROCESS_STATUS` | `FAILURE` | Async API operation failed after retries | `event.resourceId` | subscriptions.html |
| Process status timeout | `PROCESS_STATUS` | `TIMEOUT` | Async API operation timed out | `event.resourceId` | subscriptions.html |
| Shipment transport update | `SHIPMENT` | `UPDATE_TRANSPORT_EVENT` | Shipment changed transport status | `event.resourceId` (= shipmentId) | subscriptions.html |

### Webhook payload shape (all events)

```json
{
  "retailerId": "1234567",
  "timestamp": "2020-02-02T23:23:23+01:00",
  "event": {
    "resource": "PROCESS_STATUS",
    "type": "SUCCESS",
    "resourceId": "1234567"
  }
}
```

Fields:
- `retailerId` — string, your bol.com retailer ID
- `timestamp` — ISO 8601 with timezone offset
- `event.resource` — enum: `PROCESS_STATUS` | `SHIPMENT`
- `event.type` — depends on resource (see table above)
- `event.resourceId` — the ID of the affected entity (processStatusId
  or shipmentId)

Some non-webhook resources include a `metadata` object with `BPID`,
`country`, `ean` fields (for price/competing offer events). This is
irrelevant for our webhook-only use case.

---

## 2. Subscription management

### Authentication
All subscription endpoints require OAuth2 Bearer token.
Content-Type: `application/vnd.retailer.v10+json`

### Endpoints

| Operation | Method | URL | Notes |
|---|---|---|---|
| Create | `POST /retailer/subscriptions` | Creates subscription; returns 202 with processStatusId |
| List all | `GET /retailer/subscriptions` | Returns all subscriptions |
| Get one | `GET /retailer/subscriptions/{id}` | Returns single subscription |
| Update | `PUT /retailer/subscriptions/{id}` | Modify resources, URL, or enabled status |
| Delete | `DELETE /retailer/subscriptions/{id}` | Removes subscription; returns 202 |
| Test | `POST /retailer/subscriptions/test/{id}` | Sends a test notification to the subscription URL |

### Subscription model

Subscription is **per-resource-set** (not per-event-type). A single
subscription can monitor multiple resources:

```json
{
  "resources": ["PROCESS_STATUS", "SHIPMENT"],
  "url": "https://example.com/webhook",
  "subscriptionType": "WEBHOOK",
  "enabled": true
}
```

`subscriptionType` enum: `WEBHOOK` | `GCP_PUBSUB` | `AWS_SQS`

The `identity` field is required for AWS_SQS only (IAM role ARN).

### Changing the subscription URL
Use `PUT /retailer/subscriptions/{id}` with the new `url` value.

### Deactivating
Set `"enabled": false` in the PUT body. Changes propagate within 15
minutes.

### Auto-disabling
Subscriptions are automatically disabled after 10 consecutive failed
delivery attempts. Re-enable via PUT with `"enabled": true`. Messages
missed during the disabled period **cannot be resent**.

---

## 3. Delivery semantics

### HTTP method
`POST` to the registered URL.

### Expected response
Any `2xx` status code. No specific body required. Response must arrive
within **5 seconds** — exceeding this counts as a failure.

### Retry policy
- **10 total attempts**: 1 initial + 9 retries
- **Exponential backoff** with increasing intervals between retries
- **Total window**: approximately 10 minutes
- After all 10 attempts fail: subscription is **auto-disabled**

### Failure conditions (any of these triggers retry)
- Non-2xx HTTP status code
- Response timeout (>5 seconds)
- Connection refused / unreachable endpoint

### Ordering guarantees
**None.** Messages may arrive out of order due to retry timing
differences. The `timestamp` field allows detection of out-of-order
messages.

### Duplicate delivery
**At-least-once delivery.** Duplicates are possible. Bol.com
recommends: "Maintain a record of processed messages on your side to
avoid reprocessing duplicate messages." There is no built-in
idempotency key beyond `event.resourceId` + `event.type` +
`timestamp`.

---

## 4. Signature scheme (RSA-SHA256)

### Important: this is RSA, not HMAC
D-030 referenced "HMAC-signed" — the actual scheme uses **RSA-SHA256**
with asymmetric keys. Bol.com signs with a private key; we verify with
their public key.

### Signature header
```
Signature: keyId=0, algorithm="rsa-sha256", signature=<base64-encoded-signature>
```

Header name: `Signature`
Format: comma-separated key-value pairs within the header value.

### Public key retrieval
```
GET /retailer/subscriptions/signature-keys
Authorization: Bearer <token>
```

Response:
```json
{
  "signatureKeys": [
    {
      "id": "0",
      "type": "RSA",
      "publicKey": "MIIEvAIBADANBgkqhkiG9w0BAQEFAASC..."
    }
  ]
}
```

- `id` — matches `keyId` in the Signature header
- `type` — always `RSA`
- `publicKey` — Base64-encoded X.509/PKCS#8 DER key

### Verification algorithm

1. Parse the `Signature` header to extract `keyId`, `algorithm`, and
   `signature` (base64 string)
2. Fetch public keys from `/retailer/subscriptions/signature-keys`
   (cache these; they rotate infrequently)
3. Select the key whose `id` matches `keyId`
4. Base64-decode the `signature` value
5. Base64-decode the `publicKey` value and load as X.509 public key
6. Verify: RSA-SHA256 signature of the **raw request body bytes**
   using the public key

### Key rotation
Multiple keys can exist simultaneously (matched by `keyId`). Cache
keys and refresh periodically or on `keyId` miss.

### Python verification (using `cryptography` library)

```python
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
import base64

def verify_bol_signature(signature_header: str, body: bytes,
                         public_keys: dict[str, bytes]) -> bool:
    # Parse header: "keyId=0, algorithm="rsa-sha256", signature=<sig>"
    parts = dict(p.strip().split("=", 1) for p in signature_header.split(","))
    key_id = parts["keyId"]
    sig_b64 = parts["signature"]

    signature = base64.b64decode(sig_b64)
    pub_key_bytes = base64.b64decode(public_keys[key_id])
    pub_key = serialization.load_der_public_key(pub_key_bytes)

    pub_key.verify(signature, body, padding.PKCS1v15(), hashes.SHA256())
    return True  # raises InvalidSignature on failure
```

Note: the exact key format (DER vs PEM, PKCS#1 vs PKCS#8) must be
confirmed during T-B01 implementation using the test endpoint. The
example public key in the docs is very long, suggesting PKCS#8/DER.

---

## 5. Order polling (the actual new-order ingestion path)

Since webhooks cannot deliver new orders, Bol.com sales must be
ingested via API polling. This section documents the order endpoints.

### Authentication

OAuth2 Client Credentials flow:
```
POST https://login.bol.com/token
Authorization: Basic base64(clientId:clientSecret)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
```

Response: `{"access_token": "...", "token_type": "Bearer", "expires_in": 299}`

Token lifetime: **299 seconds** (~5 minutes). Cache and reuse; do NOT
request a new token per API call (rate limits are strict on the token
endpoint; violations cause IP bans).

Credentials obtained from bol.com Seller Dashboard > API Instellingen.

### List orders endpoint

```
GET /retailer/orders
  ?fulfilment-method=FBR          # FBR | FBB | ALL
  &change-interval-minute=15      # only new/changed since N minutes ago
  &status=OPEN                    # OPEN | SHIPPED | ALL
```

Poll every **5-15 minutes**. The `change-interval-minute` value should
be >= the polling interval to avoid gaps. Example: poll every 10min,
set `change-interval-minute=12`.

List response (abbreviated):
```json
{
  "orders": [
    {
      "orderId": "1043965710",
      "orderPlacedDateTime": "2019-04-30T21:56:39+02:00",
      "orderItems": [
        {
          "orderItemId": "6107989317",
          "ean": "8717418510749",
          "fulfilmentMethod": "FBB",
          "fulfilmentStatus": "OPEN",
          "quantity": 2,
          "quantityShipped": 1,
          "quantityCancelled": 1,
          "cancellationRequest": false,
          "latestChangedDateTime": "2019-04-30T21:56:39+02:00"
        }
      ]
    }
  ]
}
```

### Order detail endpoint

```
GET /retailer/orders/{orderId}
```

Rate-limited more strictly than the list endpoint. Call once per order,
only when ready to process.

Full response shape (from demo examples):
```json
{
  "orderId": "1042831430",
  "pickupPoint": false,
  "orderPlacedDateTime": "2019-04-20T12:58:39+02:00",
  "shipmentDetails": {
    "salutation": "MALE",
    "firstName": "Hans",
    "surname": "de Grote",
    "streetName": "Skywalkerstraat",
    "houseNumber": "199",
    "zipCode": "1234AB",
    "city": "PLATOONDORP",
    "countryCode": "NL",
    "email": "...@verkopen.test2.bol.com",
    "language": "nl"
  },
  "billingDetails": {
    "salutation": "MALE",
    "firstName": "Pieter",
    "surname": "Post",
    "streetName": "Skywalkerstraat",
    "houseNumber": "21",
    "zipCode": "1234AB",
    "city": "PLATOONDORP",
    "countryCode": "NL",
    "email": "...@verkopen.test2.bol.com",
    "company": "Pieter Post",
    "vatNumber": "NL123456789B01",
    "kvkNumber": "99887766",
    "orderReference": "Mijn order ref"
  },
  "orderItems": [
    {
      "orderItemId": "6107331382",
      "cancellationRequest": false,
      "fulfilment": {
        "method": "FBR",
        "distributionParty": "RETAILER",
        "latestDeliveryDate": "2018-04-18",
        "expiryDate": "2018-04-21",
        "timeFrameType": "REGULAR"
      },
      "offer": {
        "offerId": "8f6283e3-de98-c92f-e053-3598790a63b5",
        "reference": "MijnOffer0021"
      },
      "product": {
        "ean": "8712626055143",
        "title": "Star Wars - The happy family 2"
      },
      "quantity": 1,
      "quantityShipped": 1,
      "quantityCancelled": 0,
      "unitPrice": 22.98,
      "totalPrice": 19.98,
      "discounts": [
        {
          "title": "kiscier x + y promotion",
          "amount": 9.99
        }
      ],
      "commission": 2.22,
      "latestChangedDateTime": "2019-04-20T12:58:39+02:00"
    }
  ]
}
```

### Field mapping to Interwall

| Bol.com field | Interwall target | Notes |
|---|---|---|
| `orderId` | `transactions.order_ref` | Unique per order |
| `orderItems[].product.ean` | Product EAN lookup | Identifies the physical product |
| `orderItems[].offer.reference` | `external_item_xref.external_sku` | Retailer's own SKU reference for this offer |
| `orderItems[].quantity` | Sale quantity | Per order item |
| `orderItems[].unitPrice` | `transactions.sale_price` | Per unit |
| `orderItems[].commission` | Commission deduction | Bol.com's cut (per item) |
| `orderItems[].totalPrice` | Computed field | `unitPrice * quantity - discounts` |
| `orderPlacedDateTime` | `transactions.created_at` | When customer placed order |
| `shipmentDetails.countryCode` | Marketplace context | NL or BE |
| `orderItems[].cancellationRequest` | Skip / cancel flag | If true, do not process as sale |
| `orderItems[].fulfilment.method` | Filter criterion | We only process `FBR` (Fulfilled by Retailer) |

### Order lifecycle

- `OPEN` — items need to be shipped or cancelled
- `SHIPPED` — fully handled, visible for 48 hours after handling
- Unhandled FBR items auto-cancel after 3 days past expected delivery
- `cancellationRequest=true` on an item means customer requested
  cancellation; retailer must confirm via cancel endpoint

---

## 6. Questions still open

### Q1 — D-030 scope revision needed
D-030 says "Bol.com sales ingest via the Retailer API Subscription
(HMAC-signed webhooks)." Both claims are wrong:
- Webhooks don't deliver new orders (orders require polling)
- Signature is RSA-SHA256, not HMAC

**Recommendation:** Draft D-097 superseding D-030. The Bol.com
ingestion path is an **API order poller** (not a webhook receiver).
Webhooks are useful only for shipment tracking and process status
confirmation — nice-to-have, not the primary ingestion mechanism.

### Q2 — offer.reference vs EAN for SKU resolution
The order detail has two product identifiers:
- `product.ean` — the physical product's EAN
- `offer.reference` — the retailer's own reference string for this
  offer on bol.com

Which one maps to `external_item_xref.external_sku`? The email parser
currently uses a marketplace-specific SKU. The `offer.reference` is
the retailer-controlled value and is the natural candidate. But this
needs confirmation against the existing `sku_aliases` / `external_item_xref`
data to ensure continuity.

### Q3 — OAuth2 credentials storage
Where to store `client_id` and `client_secret` for the bol.com API?
Options: `.env` file (current pattern for DB creds), `fixed_costs` /
config table in DB, or a new `marketplace_credentials` table. The
email poller stores IMAP credentials in `.env` — same pattern is
simplest.

### Q4 — Commission handling
Each order item includes a `commission` field (bol.com's cut). The
current `fixed_costs` table has a commission percentage. With the API,
we get the **exact commission per item** from bol.com. Should
`process_bom_sale` use the API-provided commission instead of the
configured percentage? This is more accurate but changes the function
signature.

### Q5 — Discount handling
Order items can have discounts (promotions). The `totalPrice` already
reflects discounts. Confirm: should `transactions.sale_price` store
`unitPrice` (pre-discount) or `totalPrice / quantity` (post-discount)?
Post-discount is the actual revenue received.

### Q6 — Multi-item orders
A single bol.com order can have multiple order items (different
products). Each item is a separate sale in our system. Confirm: one
`transactions` row per order item, not per order. The `order_ref`
would need to include the `orderItemId` for uniqueness, e.g.
`bol-{orderId}-{orderItemId}`.

### Q7 — FBB orders
We only fulfil FBR (Fulfilled by Retailer) orders. FBB (Fulfilled by
Bol) orders are shipped from bol.com's warehouse. Should the poller
ignore FBB entirely, or record them for revenue tracking without stock
deduction?

---

## 7. Implementation implications for T-B01 (revised)

Given that webhooks don't deliver new orders, the Stream B task
sequence needs revision. The primary deliverable shifts from "webhook
receiver" to "API order poller."

### Revised T-B01 scope (proposed)
- **Bol.com order poller** running on APScheduler (same pattern as
  email poller), polling every 10 minutes
- OAuth2 token management (client credentials flow, 299s TTL, cached)
- `GET /retailer/orders?fulfilment-method=FBR&change-interval-minute=12`
  to fetch new FBR orders
- `GET /retailer/orders/{orderId}` for full order detail
- Insert into `ingestion_events` with `source='bolcom_api'` (D-032)
- Dedupe by `orderId + orderItemId` (at-least-once from our polling
  overlap)
- Route through existing `sale_writer.py` with `resolve_build_code`
  (T-A08 already built this)

### Webhook receiver (optional, lower priority)
A webhook receiver for `PROCESS_STATUS` and `SHIPMENT` is still
useful for:
- Confirming our shipment confirmations succeeded
- Tracking transport status for customer communication
- But it is NOT the order ingestion path

If built, the receiver needs:
- `POST /api/webhooks/bolcom` endpoint
- RSA-SHA256 signature verification (not HMAC)
- Public key cache with refresh on keyId miss
- `cryptography` library for RSA verification
- Return 200 within 5 seconds (process async)
- Dedupe on `event.resourceId + event.type`

### Python dependencies
- `cryptography` — RSA-SHA256 signature verification (if webhook
  receiver is built)
- `httpx` or `requests` — for bol.com API calls (httpx already in
  requirements.txt from T-A07a)

### Dedupe strategy
- Order poller: dedupe on `orderId + orderItemId` in
  `ingestion_events` table (UNIQUE constraint)
- Webhook receiver: dedupe on `event.resourceId + event.type + timestamp`

---

## Adversarial review: how would this doc mislead T-B01?

1. **The RSA key format assumption could be wrong.** The example
   public key in the docs is ambiguous — could be PKCS#1, PKCS#8, or
   X.509 SubjectPublicKeyInfo. The Python verification pseudocode
   assumes DER format loaded via `load_der_public_key`. T-B01 must
   test against the actual key from the test endpoint before hardcoding
   the deserialization path. **Mitigated:** noted in Section 4 that
   format must be confirmed during implementation.

2. **offer.reference may not be populated for all offers.** The demo
   data shows it populated, but if a retailer didn't set a reference
   when creating the offer on bol.com, it could be null. The fallback
   would be `product.ean` → `external_item_xref` lookup by EAN. T-B01
   must handle both paths. **Mitigated:** noted as Q2 in Section 6.

3. **The 299-second token TTL creates a race condition.** If the
   poller takes >5 minutes (unlikely at current volume but possible
   with many orders), the token expires mid-run. T-B01 must implement
   token refresh on 401 response, not just pre-flight refresh.
   **Mitigated:** noted here; T-B01 primer must include this as a test
   case.
