import { useEffect } from "react";
import { trackProductEvent } from "./product-events";

type PublicPage = "privacy" | "terms" | "acceptable-use" | "support";

const checkoutUrl = import.meta.env.VITE_LEMONSQUEEZY_CHECKOUT_URL as string | undefined;
const priceLabel = import.meta.env.VITE_PERCEPTION_PRICE_LABEL as string | undefined;
const billingSummary = import.meta.env.VITE_PERCEPTION_BILLING_SUMMARY as string | undefined;
const refundSummary = import.meta.env.VITE_PERCEPTION_REFUND_SUMMARY as string | undefined;
const operatorName = (import.meta.env.VITE_PERCEPTION_LEGAL_OPERATOR as string | undefined) || "IntentSolutions.io LLC";
const supportEmail = (import.meta.env.VITE_PERCEPTION_SUPPORT_EMAIL as string | undefined) || "support@intentsolutions.io";
const roomUrl = "?room=1";

const sampleSignals = [
  { score:"96", lane:"MODEL RELEASE", source:"OPENAI NEWS", title:"A new model crossed the release field", note:"Matched: model releases · API changes" },
  { score:"91", lane:"INCIDENT", source:"CLAUDE STATUS", title:"A provider incident needs attention", note:"Matched: availability · production operations" },
  { score:"84", lane:"PRICING", source:"TOGETHER AI", title:"A pricing change affects your watchlist", note:"Matched: inference costs · model providers" },
];

function Wordmark() {
  return <span className="public-wordmark"><span>Intent Solutions</span><b>Perception</b></span>;
}

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11M11 5l5 5-5 5" /></svg>;
}

function PublicHeader() {
  return <header className="public-header">
    <a href="./" aria-label="Perception home"><Wordmark /></a>
    <nav aria-label="Public navigation">
      <a href="./#mechanism">How it works</a>
      <a href="./#listening-post">Listening Post</a>
      <a href="./#access">Access</a>
    </nav>
    <a className="text-action" href={roomUrl} onClick={() => trackProductEvent("sign_in_opened")}>Customer sign in <Arrow /></a>
  </header>;
}

function PublicFooter() {
  return <footer className="public-footer">
    <a href="./"><Wordmark /></a>
    <p>Source-backed intelligence for people who would rather keep working.</p>
    <nav aria-label="Policies and support">
      <a href="?page=support">Support</a>
      <a href="?page=privacy">Privacy</a>
      <a href="?page=terms">Terms</a>
      <a href="?page=acceptable-use">Acceptable use</a>
      <a href="https://github.com/jeremylongshore/omarchy-listening-post-entry">GitHub</a>
    </nav>
  </footer>;
}

function PolicyPage({ page }:{ page:PublicPage }) {
  useEffect(() => window.scrollTo(0, 0), [page]);
  const content = page === "privacy" ? <>
    <h1>Your watchlist is private work.</h1>
    <p className="policy-lead">This notice explains the information Perception needs to provide the paid signal room and Listening Post connection. It does not turn product use into an advertising profile.</p>
    <h2>Information we process</h2>
    <p>We process the email attached to your Lemon Squeezy purchase, subscription and entitlement state, the topics you choose, signal read state, browser sessions, paired-device metadata, and operational security records needed to prevent abuse. Device secrets are stored as hashes and cannot be displayed again.</p>
    <h2>Why we process it</h2>
    <p>We use this information to provide and secure Perception, rank the field against your topics, synchronize read state, pair or revoke Listening Post devices, send requested access messages, answer support requests, and understand aggregate product reliability.</p>
    <h2>Service providers</h2>
    <p>Lemon Squeezy acts as merchant of record and processes checkout, payment, tax, refund, chargeback, and subscription records. The configured Intent Solutions mail service delivers transactional email. Hosting and network providers process the limited technical data required to serve the web app and API. Perception does not sell personal information or use cross-site advertising trackers.</p>
    <h2>Retention and control</h2>
    <p>We retain account and entitlement records while access is active and as needed for security, billing reconciliation, legal obligations, and dispute handling. Minimal product funnel events are retained for 90 days and contain only a closed event name, time, and the Perception account identifier when a customer is signed in. You can revoke a device immediately in the signal room. For access, correction, export, or deletion requests, email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Some billing records may need to remain with the merchant of record.</p>
    <h2>Security</h2>
    <p>Magic links expire and work once. Browser sessions use protected cookies. Listening Post tokens are shown once, stored hash-only by the API, and can be revoked from your account. No system can guarantee absolute security; report a suspected issue privately using the repository security instructions.</p>
    <p className="policy-note">Draft as of September 12, 2026. Perception is operated by {operatorName}. Governing-law and refund language remain under review.</p>
  </> : page === "terms" ? <>
    <h1>Clear terms for a quiet product.</h1>
    <p className="policy-lead">These terms govern access to the paid Perception web service. Listening Post remains separately available under the MIT license in its source repository.</p>
    <h2>Access and accounts</h2>
    <p>Your Lemon Squeezy purchase email identifies your Perception account. You are responsible for access to that mailbox and for keeping paired-device credentials private. Your use must also follow the <a href="?page=acceptable-use">Acceptable Use Policy</a>.</p>
    <h2>Subscription and cancellation</h2>
    <p>{billingSummary || "Price, billing interval, taxes, renewal terms, and any trial are shown at checkout."} Lemon Squeezy manages payment and the customer portal. Cancellation stops future renewal; access continues only through the paid-through date represented by your entitlement.</p>
    <h2>Refunds</h2>
    <p>Lemon Squeezy, as merchant of record, processes refunds and chargebacks. {refundSummary || "Refund eligibility remains pending final approval and must match the policy displayed at checkout."}</p>
    <h2>Service and sources</h2>
    <p>Perception curates and ranks third-party source material. Source availability, timing, and accuracy remain outside our control. The service may change, pause, or end, and it is not a substitute for security, legal, financial, medical, or operational incident advice. Material product changes will be communicated through an appropriate customer channel.</p>
    <h2>Intellectual property</h2>
    <p>The Perception service, interface, and original materials are protected by applicable intellectual-property law. Source articles remain the property of their publishers. The Listening Post repository is governed by its included MIT license.</p>
    <h2>Contact</h2>
    <p>Questions about access, billing, or these terms can be sent to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Perception is operated by {operatorName}.</p>
    <p className="policy-note">Draft as of September 12, 2026. Governing-law, liability, and refund language remain subject to final approval before paid production launch.</p>
  </> : page === "acceptable-use" ? <>
    <h1>Use the field without harming it.</h1>
    <p className="policy-lead">This Acceptable Use Policy protects Perception, its customers, the publishers it points to, and the infrastructure that keeps the signal room available.</p>
    <h2>Use Perception lawfully</h2>
    <p>Do not use Perception to violate law, infringe intellectual-property or privacy rights, harass or threaten people, distribute malware, facilitate fraud, or support unauthorized access to systems or data.</p>
    <h2>Respect access boundaries</h2>
    <p>Do not share or resell customer access, expose magic links or device tokens, bypass subscription or account controls, impersonate another customer, probe for credentials, or attempt to reach another account's topics, signals, devices, or records.</p>
    <h2>Protect service reliability</h2>
    <p>Do not disrupt the service, evade rate or device limits, run abusive automated traffic, scrape or bulk-export the service outside provided features, interfere with source polling, or test vulnerabilities without prior written authorization. Report suspected security issues privately through the repository security instructions.</p>
    <h2>Respect source publishers</h2>
    <p>Perception preserves links to third-party material. Do not use the service to republish, misrepresent, or remove attribution from source content in ways that violate a publisher's rights or terms. Your access to a signal does not grant ownership of its underlying article or data.</p>
    <h2>Enforcement</h2>
    <p>We may limit, suspend, or terminate access when reasonably necessary to investigate or stop prohibited activity, protect customers or infrastructure, comply with law, or respond to an urgent security risk. When practical, we will explain the restriction and provide a route to contact support.</p>
    <h2>Contact</h2>
    <p>Questions about permitted use or responsible security reporting can be sent to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    <p className="policy-note">Draft as of September 12, 2026. This rollout draft requires final governing-law and enforcement approval before paid production launch.</p>
  </> : <>
    <h1>Get the signal connected.</h1>
    <p className="policy-lead">Use the purchase email for account access. Use the private connector for Listening Post. If either path stops, start here.</p>
    <h2>I bought Perception but cannot sign in</h2>
    <p>Open customer sign in and enter the exact email used at Lemon Squeezy checkout. The link expires after 15 minutes and works once. Check spam and mail filtering, then request a fresh link. The response never reveals whether an email has an account.</p>
    <h2>Listening Post is not connected</h2>
    <p>In Perception, open Omarchy and create a device. Run the connector shown there and paste the token at its hidden prompt. Refresh Listening Post from the bar or press <kbd>r</kbd>. If a token may have been exposed, revoke that device and create another.</p>
    <h2>The field is stale or interrupted</h2>
    <p>Perception and Listening Post preserve the last good field when an update fails. Check source health in the signal room. If the API connection is interrupted, the companion does not silently switch back to unrelated local data after it has paired successfully.</p>
    <h2>Billing and cancellation</h2>
    <p>Use the customer-portal link in your account for payment details, invoices, and cancellation. Email support if the portal link is missing or the entitlement shown in Perception does not match your receipt.</p>
    <h2>Still stuck?</h2>
    <p>Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with the purchase email, what you expected, and the exact error. Never send a magic-link token, device token, browser cookie, private path, or unrelated logs.</p>
  </>;
  return <div className="public-site policy-site"><PublicHeader /><main className="policy-page"><a className="back-link" href={import.meta.env.BASE_URL}>Back to Perception</a>{page !== "support" ? <aside className="policy-draft" aria-label="Policy approval status"><strong>Rollout draft</strong><span>Not yet production terms. Governing law, refund eligibility, and final commercial configuration remain under review.</span></aside> : null}{content}</main><PublicFooter /></div>;
}

export function PublicExperience({ page }:{ page:string | null }) {
  useEffect(() => { if (page !== "privacy" && page !== "terms" && page !== "acceptable-use" && page !== "support") trackProductEvent("landing_view", true); }, [page]);
  if (page === "privacy" || page === "terms" || page === "acceptable-use" || page === "support") return <PolicyPage page={page} />;
  const purchaseHref = checkoutUrl || roomUrl;
  const purchaseLabel = checkoutUrl ? "Buy Perception" : "Open customer access";
  return <div className="public-site">
    <PublicHeader />
    <main>
      <section className="public-hero">
        <div className="hero-copy">
          <h1>Stop checking feeds.<br /><em>Let the signal come to you.</em></h1>
          <p><strong>Perception watches the web. Listening Post taps your shoulder when it matters.</strong> AI releases, pricing changes, incidents, and engineering work are ranked against your topics, kept with their sources, and shaped into a brief you can finish.</p>
          <div className="hero-actions"><a className="primary-action" href={purchaseHref} onClick={() => trackProductEvent(checkoutUrl ? "checkout_opened" : "sign_in_opened")}>{purchaseLabel} <Arrow /></a><a className="text-action" href={roomUrl} onClick={() => trackProductEvent("sign_in_opened")}>Sign in with purchase email</a></div>
          <small>{checkoutUrl ? "Secure checkout by Lemon Squeezy. No password to create." : "Production checkout opens when the launch configuration is connected."}</small>
        </div>
        <div className="field-window" aria-label="Example Perception priority field">
          <div className="field-window-head"><span><i /> FIELD / EXAMPLE</span><span>3 SIGNALS</span></div>
          <div className="field-sweep"><span /><span /><span /><span /><span /><span /><span /></div>
          <p>What changed while you worked.</p>
          {sampleSignals.map((signal) => <article key={signal.lane}>
            <b>{signal.score}<small>match</small></b><div><span>{signal.lane} · {signal.source}</span><h2>{signal.title}</h2><small>{signal.note}</small></div>
          </article>)}
          <div className="field-window-foot"><span>Every row keeps its source.</span><span>Illustrative field · not live data</span></div>
        </div>
      </section>

      <section className="public-promise" aria-label="Product boundaries">
        <p><strong>Finite field</strong><span>A brief you can clear</span></p>
        <p><strong>Source-backed</strong><span>Every signal links out</span></p>
        <p><strong>Quiet by design</strong><span>No filler when nothing changed</span></p>
        <p><strong>Omarchy native</strong><span>Listening Post stays at work</span></p>
      </section>

      <section id="mechanism" className="mechanism-section">
        <div className="section-statement"><h2>A brief you can finish.</h2><p>The problem is not a lack of information. It is the repeated act of leaving the work to check whether anything important happened.</p></div>
        <div className="mechanism-flow" aria-label="The Perception Loop">
          <article><span>WATCH</span><h3>A deliberate source field</h3><p>Primary feeds, provider status pages, release streams, and selected technical publications are polled independently.</p></article>
          <article><span>RANK</span><h3>Your topics set the threshold</h3><p>Operational impact and your watchlist decide what rises. Routine chatter can remain quiet.</p></article>
          <article><span>EXPLAIN</span><h3>Reason and source together</h3><p>Each signal carries the reason it matched and a direct route back to the publisher.</p></article>
          <article><span>RETURN</span><h3>Then get back to work</h3><p>Read the finite brief, clear the field, and let Perception keep watching.</p></article>
        </div>
      </section>

      <section id="listening-post" className="companion-section">
        <div className="companion-copy"><h2>Perception does the deep work.<br />Listening Post keeps watch.</h2><p>The free MIT-licensed Omarchy companion carries the same ranked field into your bar. It speaks for a model release, a pricing change, or an open incident. Nothing new means the slot can disappear.</p><a className="text-action" href="https://github.com/jeremylongshore/omarchy-listening-post-entry">Inspect Listening Post on GitHub <Arrow /></a></div>
        <div className="desktop-bridge" aria-label="Listening Post states">
          <div><span className="bar-mark">P</span><code>AI: 3 new</code><small>releases or pricing changes</small></div>
          <div><span className="bar-mark incident-mark">P</span><code>OpenAI incident</code><small>an unresolved provider event</small></div>
          <div className="quiet-bridge"><span className="bar-mark">P</span><code>nothing new</code><small>the slot collapses</small></div>
        </div>
      </section>

      <section className="trust-section">
        <h2>Built to earn a place in your operating environment.</h2>
        <div><p><b>Private by design.</b> Purchase-email access, protected browser sessions, hash-only device credentials, and no cross-site advertising profile.</p><p><b>Honest under failure.</b> A stale source or interrupted connection keeps the last good field visible and labeled.</p><p><b>Source-backed.</b> Perception points outward. It does not ask you to trust a summary without the material behind it.</p></div>
      </section>

      <section id="access" className="access-section">
        <div><h2>Simple, honest access.</h2><p>Purchase Perception through Lemon Squeezy, then use that same email to enter your private field. Listening Post pairs from inside the account and can be revoked at any time.</p></div>
        <div className="access-offer"><h3>{checkoutUrl && priceLabel ? priceLabel : checkoutUrl ? "Price shown at secure checkout" : "Checkout configuration pending"}</h3><ul><li>Ranked priority field and finite daily brief</li><li>Up to eight customer-defined topics</li><li>Source health and direct source links</li><li>Listening Post device pairing and revocation</li><li>Passwordless purchase-email access</li></ul><a className="primary-action" href={purchaseHref} onClick={() => trackProductEvent(checkoutUrl ? "checkout_opened" : "sign_in_opened")}>{purchaseLabel} <Arrow /></a><small>{billingSummary || "Billing terms, taxes, renewal, and refund eligibility appear before payment."}</small></div>
      </section>

      <section className="faq-section">
        <h2>Before you open the field.</h2>
        <div>
          <details><summary>Is Listening Post the paid product?</summary><p>No. Listening Post is the free MIT-licensed Omarchy companion. Perception is the paid web signal room and account service it can connect to.</p></details>
          <details><summary>Why is the purchase email my account?</summary><p>Lemon Squeezy already verifies the customer relationship. Perception uses that email for one-time sign-in links, so there is no separate password or social-login account to create.</p></details>
          <details><summary>Does Perception use AI to rewrite everything?</summary><p>The customer value is selection, ranking, provenance, and a finite brief. Every signal retains its source. Perception does not claim to know everything or replace the underlying material.</p></details>
          <details><summary>What happens when a source or the API fails?</summary><p>Failures are shown as state, not disguised as fresh data. The last good field remains available where possible while source health explains what stopped.</p></details>
          <details><summary>Can I cancel?</summary><p>Yes. The customer portal controls renewal. Access follows the paid-through date on the entitlement returned by Lemon Squeezy.</p></details>
        </div>
      </section>

      <section className="closing-section"><h2>Keep the work in front of you.<br /><em>Let Perception keep the field.</em></h2><div><a className="primary-action" href={purchaseHref} onClick={() => trackProductEvent(checkoutUrl ? "checkout_opened" : "sign_in_opened")}>{purchaseLabel} <Arrow /></a><a className="text-action" href={roomUrl} onClick={() => trackProductEvent("sign_in_opened")}>Already a customer? Sign in</a></div></section>
    </main>
    <PublicFooter />
  </div>;
}
