import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_LIMITS,
  validateContactFields,
} from "../src/lib/contact-validation.mjs";

const valid = {
  name: "Test Person",
  email: "test@example.com",
  company: "",
  phone: "",
  lookingFor: "General Inquiry",
  message: "Please discuss our calling workflow.",
};

test("contact normalization accepts pasted whitespace and formatted phone numbers without leaking extra fields", () => {
  const result = validateContactFields({
    ...valid,
    name: "  Test Person  ",
    email: " TEST@EXAMPLE.COM ",
    phone: " +1 (218) 452-5998 ",
    source: "visitor-controlled",
    to: "other@example.com",
  });
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.fields, {
    ...valid,
    name: "Test Person",
    email: "test@example.com",
    phone: "+1 (218) 452-5998",
  });
  assert.deepEqual(
    validateContactFields({ ...valid, lookingFor: "Evaluation" }).errors,
    {},
  ); // Existing API clients keep their enquiry labels.
});

test("contact fields enforce length boundaries and retain oversized text rather than truncating it", () => {
  for (const field of ["name", "company", "lookingFor", "message"]) {
    const limit = CONTACT_LIMITS[field];
    assert.deepEqual(
      validateContactFields({ ...valid, [field]: "x".repeat(limit) }).errors,
      {},
    );
    const result = validateContactFields({
      ...valid,
      [field]: "x".repeat(limit + 1),
    });
    assert.ok(result.errors[field]);
    assert.equal(result.fields[field].length, limit + 1);
  }
  const email = "a".repeat(242) + "@example.com";
  assert.equal(email.length, 254);
  assert.deepEqual(validateContactFields({ ...valid, email }).errors, {});
  assert.ok(
    validateContactFields({ ...valid, email: `a${email}` }).errors.email,
  );
});

test("required, malformed and non-text fields are rejected consistently; optional omissions remain valid", () => {
  for (const input of [
    null,
    [],
    {},
    { ...valid, name: "x" },
    { ...valid, email: "invalid" },
    { ...valid, message: "short" },
    { ...valid, lookingFor: " " },
    { ...valid, phone: "call me" },
    { ...valid, company: { name: "Acme" } },
  ]) {
    assert.ok(Object.keys(validateContactFields(input).errors).length > 0);
  }
  const requiredOnly = { ...valid };
  delete requiredOnly.company;
  delete requiredOnly.phone;
  assert.deepEqual(validateContactFields(requiredOnly).errors, {});
  assert.ok(
    validateContactFields({
      ...valid,
      phone: "1".repeat(41),
    }).errors.phone.includes("40"),
  );
});
