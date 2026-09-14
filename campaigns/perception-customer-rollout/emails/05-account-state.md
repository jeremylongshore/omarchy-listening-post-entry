---
email: lifecycle
sequence: perception-post-purchase
purpose: Explain billing attention, cancellation, and access end states
send_day: event-driven
send_time: Immediately after an accepted state-changing webhook
delivery: API transactional outbox
subject_line_a: "Your Perception billing needs attention"
subject_line_b: "Perception will stay open through your paid period"
subject_line_c: "Your Perception access has ended"
recommended_subject: state-specific
preview_text: "The message reflects the current Lemon Squeezy entitlement"
cta: "Review your account or manage billing"
status: implemented
---

# Account State Messages

These are separate transactional templates in `api/src/mailer.ts`, selected from the entitlement state:

- `past_due` or `unpaid`: explain that billing needs attention and route to the customer portal.
- `cancelled`: confirm renewal is off and show the paid-through date when Lemon Squeezy provides one.
- `expired`: confirm that web and device access have ended and route to customer access.

Every version contains one state-specific action, support and privacy links, plain-text parity, and no invented grace period or refund promise.
