import { describe, it, expect } from "vitest";
import {
  buildRegistrationDecisionEmail,
  buildOutbidEmail,
  buildWonEmail,
  buildReceiptEmail,
} from "./notifications";

describe("buildRegistrationDecisionEmail", () => {
  it("approved mentions the sale and approval", () => {
    const { subject, html } = buildRegistrationDecisionEmail("Modern Art", true);
    expect(subject).toMatch(/approved/i);
    expect(html).toContain("Modern Art");
  });
  it("rejected mentions the sale and rejection", () => {
    const { subject, html } = buildRegistrationDecisionEmail("Modern Art", false);
    expect(subject).toMatch(/not approved|declined|rejected/i);
    expect(html).toContain("Modern Art");
  });
});

describe("buildOutbidEmail", () => {
  it("names the lot and links to it", () => {
    const { subject, html } = buildOutbidEmail("Coastal Morning", "https://x/lots/1");
    expect(subject).toMatch(/outbid/i);
    expect(html).toContain("Coastal Morning");
    expect(html).toContain("https://x/lots/1");
  });
});

describe("buildWonEmail", () => {
  it("congratulates and links to the lot", () => {
    const { subject, html } = buildWonEmail("Coastal Morning", "https://x/lots/1");
    expect(subject).toMatch(/won|congratulations/i);
    expect(html).toContain("Coastal Morning");
    expect(html).toContain("https://x/lots/1");
  });
});

describe("buildReceiptEmail", () => {
  it("shows the lot and the formatted total", () => {
    const { subject, html } = buildReceiptEmail("Coastal Morning", 3_788_200);
    expect(subject).toMatch(/payment|receipt/i);
    expect(html).toContain("Coastal Morning");
    expect(html).toMatch(/Rp\s?3\.788\.200/);
  });
});
