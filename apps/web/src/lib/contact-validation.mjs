/** @typedef {{ name: string, email: string, company: string, phone: string, lookingFor: string, message: string }} ContactFields */
/** @typedef {keyof ContactFields} ContactField */
/** @typedef {Partial<Record<ContactField, string>>} ContactErrors */

/** @type {ContactField[]} */
export const CONTACT_FIELDS = [
  "name",
  "email",
  "company",
  "phone",
  "lookingFor",
  "message",
];

export const CONTACT_LIMITS = Object.freeze({
  name: 120,
  email: 254,
  company: 160,
  phone: 40,
  lookingFor: 120,
  message: 5000,
});

export const CONTACT_LABELS = Object.freeze({
  name: "Name",
  email: "Email",
  company: "Company",
  phone: "Phone",
  lookingFor: "Enquiry type",
  message: "Message",
});

/** @returns {ContactFields} */
export function emptyContactFields() {
  return {
    name: "",
    email: "",
    company: "",
    phone: "",
    lookingFor: "General Inquiry",
    message: "",
  };
}

/**
 * The browser and public API use the same normalization and length boundaries.
 * Never shorten an enquiry silently. Extra keys cannot enter the delivery payload.
 * @param {unknown} input
 * @returns {{ fields: ContactFields, errors: ContactErrors }}
 */
export function validateContactFields(input) {
  const source =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const fields = emptyContactFields();
  /** @type {ContactErrors} */
  const errors = {};
  for (const field of CONTACT_FIELDS) {
    const value = source[field];
    fields[field] = typeof value === "string" ? value.trim() : "";
    if (value !== undefined && typeof value !== "string") {
      errors[field] = `${CONTACT_LABELS[field]} must be text.`;
    } else if (fields[field].length > CONTACT_LIMITS[field]) {
      errors[field] =
        `${CONTACT_LABELS[field]} must be ${CONTACT_LIMITS[field]} characters or fewer.`;
    }
  }
  fields.email = fields.email.toLowerCase();
  if (!errors.name && fields.name.length < 2)
    errors.name = "Enter your name (at least 2 characters).";
  if (!errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
    errors.email = "Enter a valid email address.";
  if (
    !errors.phone &&
    fields.phone &&
    !/^[+]?[1-9][\d\s().-]{3,24}$/.test(fields.phone)
  )
    errors.phone = "Enter a valid phone number, including its country code.";
  if (!errors.lookingFor && !fields.lookingFor)
    errors.lookingFor = "Choose an enquiry type.";
  if (!errors.message && fields.message.length < 10)
    errors.message = "Tell us a little more (at least 10 characters).";
  return { fields, errors };
}
