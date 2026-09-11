---
sequence: perception-post-purchase
type: post-purchase
date: 2026-09-11
status: rollout-ready
esp: not connected
---

# Perception Customer Lifecycle

| Message | Trigger | Delivery owner | One action |
| --- | --- | --- | --- |
| Purchase welcome | Accepted `subscription_created` webhook | Perception SMTP outbox | Open customer access |
| First field | Day 1 if customer has not reached first value | Future ESP/automation | Confirm topics and open one source |
| Listening Post | Day 3 if no device has paired | Future ESP/automation | Pair one Omarchy workstation |
| Quiet by design | Day 7 for active customers | Future ESP/automation | Return to the finite brief |
| Billing attention | `past_due` or `unpaid` webhook state | Perception SMTP outbox | Open Lemon Squeezy customer portal |
| Cancellation | `cancelled` webhook state | Perception SMTP outbox | Review paid-through access |
| Access ended | `expired` webhook state | Perception SMTP outbox | Review customer access |

Transactional delivery is implemented through the API's durable `customer_messages` outbox. Messages are unique by subscription, upstream update time, and lifecycle kind. SMTP failure keeps the message pending with bounded retries and a five-minute claim timeout.

No marketing ESP is connected. Day 1, 3, and 7 messages remain copy-paste-ready until a consent-aware lifecycle tool and unsubscribe policy are selected. They must not be sent as transactional mail.
