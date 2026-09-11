import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
    expect(html).toContain("Draft as of September 11, 2026");
    expect(html).toContain("Use the field without harming it.");
    expect(html).toContain("Respect access boundaries");
    expect(html).toContain("Protect service reliability");
    expect(html).toContain("Respect source publishers");
    expect(html).toContain("Enforcement");
  });

  it("incorporates acceptable use into the service terms", () => {
    const html = renderToStaticMarkup(<PublicExperience page="terms" />);
    expect(html).toContain("Acceptable Use Policy");
    expect(html).toContain("?page=acceptable-use");
  });
});
