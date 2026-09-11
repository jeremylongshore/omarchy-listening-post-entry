import nodemailer from "nodemailer";
import type { MagicLinkSender } from "./browser-auth.js";
import type { CustomerMessage, CustomerMessageSender } from "./customer-messages.js";

export type SmtpConfig = {
  host:string; port:number; secure:boolean; user:string; password:string; from:string;
};

export function createSmtpMailer(config:SmtpConfig, webOrigin:string):{ magicLinkSender:MagicLinkSender; customerMessageSender:CustomerMessageSender } {
  const transport = nodemailer.createTransport({
    host:config.host, port:config.port, secure:config.secure,
    auth:{ user:config.user, pass:config.password },
  });
  const magicLinkSender:MagicLinkSender = {
    async send({ email, url }) {
      await transport.sendMail({
        from:config.from,
        to:email,
        subject:"Open your Perception signal room",
        text:`Use this private link to open Perception:\n\n${url}\n\nIt expires in 15 minutes and works once. If you did not request it, you can ignore this email.`,
        html:`<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:auto;color:#171914"><p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase">Perception</p><h1 style="font-family:Georgia,serif;font-weight:500">Your signal room is ready.</h1><p>Use this private link to sign in. It expires in 15 minutes and works once.</p><p style="margin:28px 0"><a href="${escapeHtml(url)}" style="background:#171914;color:#fff;padding:12px 18px;text-decoration:none;border-radius:3px">Open Perception</a></p><p style="color:#65685f;font-size:13px">If you did not request this email, you can ignore it.</p></div>`,
      });
    },
  };
  const customerMessageSender:CustomerMessageSender = {
    async sendCustomerMessage(message) {
      const rendered = renderCustomerMessage(message, webOrigin);
      await transport.sendMail({ from:config.from, to:message.email, ...rendered });
    },
  };
  return { magicLinkSender, customerMessageSender };
}

export function createSmtpMagicLinkSender(config:SmtpConfig):MagicLinkSender {
  return createSmtpMailer(config, "https://perception.intentsolutions.io").magicLinkSender;
}

export function renderCustomerMessage(message:CustomerMessage, webOrigin:string):{ subject:string; text:string; html:string } {
  const firstName = message.name?.trim().split(/\s+/)[0] || null;
  const hello = firstName ? `Hi ${firstName},` : "Hello,";
  const roomUrl = `${webOrigin}/?room=1`;
  const portalAction = message.portalUrl ? `\n\nManage billing: ${message.portalUrl}` : "";
  const ends = message.endsAt ? formatDate(message.endsAt) : null;
  const variants = {
    welcome:{
      subject:"Perception is on watch",
      heading:"Your signal room is ready.",
      body:"Your purchase email is now your Perception account. Open the signal room, request a private sign-in link, and confirm the topics worth watching. Your first source-backed field should take about two minutes to reach.",
      action:"Open your signal room", url:roomUrl,
      tail:"Listening Post is optional. Pair it from the Omarchy view after the field feels right.",
    },
    billing_attention:{
      subject:"Your Perception billing needs attention",
      heading:"The field is waiting on billing.",
      body:"Lemon Squeezy reported a payment state that needs attention. Update the payment method in the customer portal to keep your Perception entitlement current.",
      action:"Manage billing", url:message.portalUrl || roomUrl,
      tail:"Perception will continue to show the account state it receives from Lemon Squeezy.",
    },
    cancelled:{
      subject:"Perception will stay open through your paid period",
      heading:"Renewal is off.",
      body:`Your Perception subscription is cancelled.${ends ? ` Access remains available through ${ends}.` : " Your signal room will show the paid-through state reported by Lemon Squeezy."}`,
      action:"Review your account", url:message.portalUrl || roomUrl,
      tail:"You can keep using the signal room and Listening Post while the entitlement remains active.",
    },
    access_ended:{
      subject:"Your Perception access has ended",
      heading:"The paid field is closed.",
      body:"Lemon Squeezy now reports this subscription as expired. Your account and paired-device credentials can no longer open the paid Perception field.",
      action:"Review customer access", url:message.portalUrl || roomUrl,
      tail:"Listening Post remains free software. Reopening paid access restores the account-backed field after the entitlement updates.",
    },
  } as const;
  const content = variants[message.kind];
  const text = `${hello}\n\n${content.heading}\n\n${content.body}\n\n${content.action}: ${content.url}\n\n${content.tail}${message.kind === "billing_attention" ? portalAction : ""}\n\n— Perception\nQuiet by design.`;
  const html = `<div style="background:#0c141b;color:#e8edf0;padding:32px 18px;font-family:ui-sans-serif,system-ui,sans-serif"><div style="max-width:580px;margin:auto"><p style="color:#efa84a;font:600 12px ui-monospace,monospace;letter-spacing:.14em">PERCEPTION</p><p style="color:#a7b5bd">${escapeHtml(hello)}</p><h1 style="font-family:Georgia,serif;font-size:38px;line-height:1.05;font-weight:500">${escapeHtml(content.heading)}</h1><p style="color:#b0bdc4;line-height:1.7">${escapeHtml(content.body)}</p><p style="margin:30px 0"><a href="${escapeHtml(content.url)}" style="display:inline-block;background:#efa84a;color:#10161a;padding:14px 18px;text-decoration:none;font:600 12px ui-monospace,monospace">${escapeHtml(content.action)}</a></p><p style="color:#8999a4;line-height:1.65;font-size:13px">${escapeHtml(content.tail)}</p><p style="border-top:1px solid #26343d;margin-top:34px;padding-top:18px;color:#71838d;font-size:11px">Perception · Quiet by design.<br><a href="${escapeHtml(webOrigin)}/?page=support" style="color:#efa84a">Support</a> · <a href="${escapeHtml(webOrigin)}/?page=privacy" style="color:#efa84a">Privacy</a></p></div></div>`;
  return { subject:content.subject, text, html };
}

function escapeHtml(value:string):string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatDate(value:string):string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { year:"numeric", month:"long", day:"numeric", timeZone:"UTC" }).format(date) : value;
}
