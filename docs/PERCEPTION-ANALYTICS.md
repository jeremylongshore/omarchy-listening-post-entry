# Perception Product Events

Perception records the minimum first-party funnel needed to learn whether the customer journey works. Product behavior never depends on event delivery. There is no Firebase dependency, advertising identifier, third-party tracking script, arbitrary property bag, captured URL, IP column, user-agent column, or email column.

## Closed event vocabulary

| Event | Source | Meaning |
| --- | --- | --- |
| `landing_view` | Public web | The product page rendered. |
| `checkout_opened` | Public web | A configured Lemon Squeezy checkout link was selected. |
| `purchase_entitled` | Signed billing webhook | An in-catalog subscription-created event granted access. |
| `sign_in_opened` | Public web | Customer access was selected. |
| `magic_link_requested` | Private web | The generic sign-in request was accepted. |
| `signal_room_opened` | Private web | An entitled snapshot rendered. |
| `first_signal_opened` | Private web | A source link was opened; emitted once per page lifetime. |
| `device_credential_created` | Private web | A Listening Post device credential was created. |
| `listening_post_paired` | Private web | A device has a non-null API `last_seen_at`; emitted once per page lifetime. |

The browser may send only `{ "name": "<allowed event>" }`. `purchase_entitled` is server-only. Unknown names, extra fields, and cross-origin writes are rejected. The endpoint is rate-limited, returns `202`, and event errors are ignored by the UI.

Signed-in events may reference the internal account ID. Anonymous public events have no account. Every insert deletes records older than 90 days.

## Funnel query

```sql
SELECT event_name, count(*) AS events,
       count(DISTINCT account_id) AS signed_in_accounts
FROM product_events
WHERE occurred_at >= datetime('now', '-30 days')
GROUP BY event_name
ORDER BY CASE event_name
  WHEN 'landing_view' THEN 1
  WHEN 'checkout_opened' THEN 2
  WHEN 'purchase_entitled' THEN 3
  WHEN 'magic_link_requested' THEN 4
  WHEN 'signal_room_opened' THEN 5
  WHEN 'first_signal_opened' THEN 6
  WHEN 'device_credential_created' THEN 7
  WHEN 'listening_post_paired' THEN 8
  ELSE 9 END;
```

Counts are directional product diagnostics, not unique visitor analytics. Public events intentionally carry no visitor identifier, and repeated page loads can increase their counts.

## Retention and deletion

- Automatic event retention: 90 days.
- Deleting an account sets historical event `account_id` to null rather than deleting aggregate operational history.
- Account exports and deletion requests must include the product-events table in the operator procedure.
- Do not add arbitrary metadata without a privacy review, schema change, retention decision, tests, and a matching policy update.
