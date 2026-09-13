/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_PERCEPTION_API_URL?: string;
  readonly VITE_PERCEPTION_DEMO?: string;
  readonly VITE_LEMONSQUEEZY_CHECKOUT_URL?: string;
  readonly VITE_PERCEPTION_PRICE_LABEL?: string;
  readonly VITE_PERCEPTION_BILLING_SUMMARY?: string;
  readonly VITE_PERCEPTION_REFUND_SUMMARY?: string;
  readonly VITE_PERCEPTION_LEGAL_OPERATOR?: string;
  readonly VITE_PERCEPTION_SUPPORT_EMAIL?: string;
  readonly VITE_PERCEPTION_TERMS_APPROVED?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
