/**
 * How a customer is addressed and named in the admin: an account by its id, a
 * guest (no account) by the address they ordered with.
 */
import { describe, expect, it } from "vitest";
import { customerHref } from "@/services/customers.service";
import { KIND_LABEL, STATUS_PILL, money, words } from "@/lib/customerWords";

describe("a customer's page address", () => {
  it("is the account's id, or the guest's address", () => {
    expect(customerHref({ id: "bdba6f0b-72da-42ff-b2ce-95385ba5ad4e", kind: "wholesale" })).toBe("/admin/customers/bdba6f0b-72da-42ff-b2ce-95385ba5ad4e");
    expect(customerHref({ id: "guest:ava+1@example.com", kind: "guest", email: "ava+1@example.com" }))
      .toBe("/admin/customers/guest?email=ava%2B1%40example.com");
    expect(customerHref({ id: "guest:leo@example.com", kind: "guest" })).toBe("/admin/customers/guest?email=leo%40example.com");
  });
});

describe("the words a customer is shown with", () => {
  it("names each kind and says a guest has no account", () => {
    expect(KIND_LABEL).toEqual({ retail: "Retail", wholesale: "Wholesale", guest: "Guest" });
    expect(STATUS_PILL.guest?.[0]).toBe("No account");
  });
  it("writes money and stored words for people", () => {
    expect(money(1249.69)).toBe("$1,249.69");
    expect(money(null)).toBe("$0.00");
    expect(words("screen_printer")).toBe("Screen printer");
    expect(words(null)).toBe("");
  });
});
