# Cost worksheet instructions

[Open the CSV](cost-estimation.csv) in Excel, LibreOffice Calc or Google Sheets using comma-separated import and formula interpretation. Keep the header on row 1 and the original row order: formulas reference column B by row. This file intentionally contains spreadsheet formulas. Do not import it as a plain-text-only table if you want calculations.

## What to edit

Edit column B in rows 2–30 and baseline row 51. The nonzero values are illustrative arithmetic inputs, not typical customer usage, supplier prices or deployment estimates. Zero supplier rates mean **unknown**, not free. Replace every applicable input with measured values or dated quotes, then set B29 and B30 to 1 only when the underlying checks are actually complete. Record quote URLs, quote dates, provider/model/region, billing increment and exclusions in column D.

All costs use USD. Convert other currencies at your approved dated exchange rate before entry. Fractions are decimals: enter `0.6` for 60%, not `60`. Duration is in minutes; labor is USD per hour; LLM price is USD per **one million tokens**; TTS price is USD per **one million characters**. If a provider uses another unit, convert it before entering a rate. A blended LLM rate must account for your input/output/cached-token mix. Do not add a separate component charge if it is already included in a bundled runtime quote.

The model includes unanswered attempts, connected runtime, speech/model costs, phone numbers, infrastructure, storage, human follow-up, quality review, amortized implementation and contingency. Human follow-up uses answered calls as its denominator; add follow-up on unanswered attempts in other monthly costs if applicable. Carrier legs, transfer legs, rounding, minimum commitments, retry rules, taxes, peak-capacity charges, training, supervision and support may require additional amounts in row 28. Avoid counting a bill twice.

## How to interpret results

- Row 46: modeled monthly cost, including amortized implementation and contingency.
- Rows 47–48: modeled cost per attempt and per answered call. These are different denominators.
- Row 49: initial engineering cash cost. It is also spread over row 25's amortization period in the monthly model; do not add it a second time when making an amortized comparison.
- Row 50: input check. The default is explicitly **ILLUSTRATIVE OR INVALID — NOT A QUOTE**. “Confirmed inputs” means your flags and numeric ranges pass; it is not independent validation of source evidence.
- Row 51: comparable measured baseline monthly cost. Leave zero if unknown. Use the same call types, period, service level and cost scope.
- Rows 52–53: modeled difference from baseline, shown only after inputs are confirmed and baseline is positive. These are **not measured savings, ROI, or a revenue forecast**. A negative value means the modeled workflow costs more.

## Arithmetic check with the untouched sample

The illustrative inputs yield 600 answered calls, 400 unanswered attempts and 1,800 connected minutes. Because supplier rates remain unknown/zero, the visible subtotal is incomplete: human follow-up is $360, quality review $120, amortized implementation $125, subtotal $605 and contingency $90.75, for $695.75. This is a formula sanity check, **not a usable price estimate**. The one-time illustrative implementation cost is $1,500. The validation flag must stay unconfirmed and baseline differences blank.

Before using a decision estimate, reconcile one actual provider invoice or approved quote against the model, compare an independent hand calculation, test a zero-call and invalid-fraction input, and verify the validation flag changes appropriately. Retain the assumption sheet with the date of the business decision; do not reuse an old quote silently.
