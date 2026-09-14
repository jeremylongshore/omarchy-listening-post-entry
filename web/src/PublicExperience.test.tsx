import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicExperience } from "./PublicExperience";

describe("public customer policies", () => {
  it("links the complete customer policy set from the public footer", () => {
    const html = renderToStaticMarkup(<PublicExperience page={null} />);
    expect(html).toContain('href="./"');
    expect(html).toContain('href="./#mechanism"');
    expect(html).toContain("?page=privacy");
    expect(html).toContain("?page=terms");
    expect(html).toContain("?page=acceptable-use");
  });

  it("renders a substantive acceptable use policy", () => {
    const html = renderToStaticMarkup(<PublicExperience page="acceptable-use" />);
    expect(html).toContain("Rollout draft");
    expect(html).toContain("Not yet production terms");
    expect(html).toContain("Draft as of September 12, 2026");
    expect(html).toContain("Use the field without harming it.");
    expect(html).toContain("Respect access boundaries");
    expect(html).toContain("Protect service reliability");
    expect(html).toContain("Respect source publishers");
    expect(html).toContain("Enforcement");
  });

  it("uses the verified operator and support route", () => {
    const html = renderToStaticMarkup(<PublicExperience page="terms" />);
    expect(html).toContain("IntentSolutions.io LLC");
    expect(html).toContain("mailto:support@intentsolutions.io");
    expect(html).not.toContain("mailto:jeremy@intentsolutions.io");
  });

  it("incorporates acceptable use into the service terms", () => {
    const html = renderToStaticMarkup(<PublicExperience page="terms" />);
    expect(html).toContain("Acceptable Use Policy");
    expect(html).toContain("?page=acceptable-use");
    expect(html).toContain("Governing law");
    expect(html).toContain("laws of Alabama, United States");
  });

  it("removes rollout qualifiers only for the validated approved build", async () => {
    vi.stubEnv("VITE_PERCEPTION_TERMS_APPROVED", "true");
    vi.stubEnv("VITE_PERCEPTION_GOVERNING_LAW", "Alabama, United States");
    vi.stubEnv("VITE_PERCEPTION_TERMS_EFFECTIVE_DATE", "September 14, 2026");
    vi.resetModules();
    const { PublicExperience: ApprovedExperience } = await import("./PublicExperience");
    const html = renderToStaticMarkup(<ApprovedExperience page="terms" />);
    expect(html).not.toContain("Rollout draft");
    expect(html).not.toContain("Not yet production terms");
    expect(html).toContain("Effective September 14, 2026");
    expect(html).toContain("laws of Alabama, United States");
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
