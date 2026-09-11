/// <reference types="vite/client" />
interface ImportMetaEnv { readonly VITE_PERCEPTION_API_URL?: string; readonly VITE_PERCEPTION_DEMO?: string; }
interface ImportMeta { readonly env: ImportMetaEnv; }
