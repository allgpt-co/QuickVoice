export const plans = [
  {
    id: "prepaid",
    name: "Prepaid wallet",
    description:
      "Usage-based AI and telephony billing with no required monthly subscription.",
    price: 0,
    currency: "USD",
    signupCredit: 5,
    minimumTopUp: 5,
    maximumTopUp: 500,
    topUpIncrement: 5,
  },
] as const;
