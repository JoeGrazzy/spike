# SPIKE Phase 11 — affordable launch catalogue

**Date:** 18 November 2026  
**Production project:** `Spikemediachat` (`veagqanfilmbchlvlpcc`)  
**Migration:** `20261118230201_publish_six_affordable_coin_packages_two_verified_plans`

## Published active catalogue

| Type | Package | Amount | Price |
|---|---|---:|---:|
| SP Coin | Mini | 20 coins | ₦100 |
| SP Coin | Basic | 55 coins | ₦250 |
| SP Coin | Starter | 120 coins | ₦500 |
| SP Coin | Popular | 260 coins | ₦1,000 |
| SP Coin | Value | 550 coins | ₦2,000 |
| SP Coin | Premium | 1,450 coins | ₦5,000 |
| Verified | Monthly | 30 days | ₦300 |
| Verified | Yearly | 365 days | ₦2,500 |

Exactly six coin products and two Verified products are active. Other catalogue rows are retained for historical order references but deactivated.

## Implementation

- Reused `public.spike_purchase_products`; no new catalogue table was created.
- Reused `spike_get_purchase_catalog`, `spike_create_purchase_order`, and the existing owner-reviewed payment workflow.
- Existing wallet frontend renders coin quantities and NGN prices from the server catalogue.
- The ₦1,000 package is highlighted as Most popular.
- Existing monthly/yearly subscription buttons continue to resolve their prices and durations from the server catalogue.
- Coin credits and subscription activation remain exclusively in the existing owner approval RPC. The frontend cannot approve or credit purchases.

## Verification

- Live SQL inventory: 6 active `coin` products and 2 active `verified` products.
- `spike_get_purchase_catalog()` returns all eight products with the configured prices, quantities, and durations.
- No payment order was created, no payment was approved, and no wallet balance was changed during catalogue publication.

## Business note

These are affordable proposed launch prices, not a validated margin model. Review actual delivery costs and the economic value of each SP Coin before broad promotion. The catalogue can be repriced without changing historical purchase-order snapshots.
