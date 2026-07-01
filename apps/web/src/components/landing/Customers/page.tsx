type Customer = {
  name: string;
  detail: string;
};

const upperRowCustomers: Customer[] = [
  { name: "Healthcare clinics", detail: "Patient scheduling" },
  { name: "Dental practices", detail: "After-hours intake" },
  { name: "Real estate teams", detail: "Lead follow-up" },
  { name: "Automotive dealerships", detail: "Service booking" },
  { name: "Education teams", detail: "Admissions calls" },
  { name: "Logistics operators", detail: "Delivery updates" },
];

const lowerRowCustomers: Customer[] = [
  { name: "Insurance agencies", detail: "Policy support" },
  { name: "Home service teams", detail: "Dispatch routing" },
  { name: "Travel operators", detail: "Reservation help" },
  { name: "Financial services", detail: "Account inquiries" },
  { name: "E-commerce brands", detail: "Order status" },
  { name: "Property managers", detail: "Tenant requests" },
];

const MARQUEE_REPEAT_COUNT = 4;

function CustomerPill({
  customer,
  tone,
  isDuplicate = false,
}: {
  customer: Customer;
  tone: "upper" | "lower";
  isDuplicate?: boolean;
}) {
  const initials = customer.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const isLower = tone === "lower";

  return (
    <li
      aria-hidden={isDuplicate ? "true" : undefined}
      className={`flex h-20 min-w-[260px] items-center gap-4 rounded-full border px-4 pr-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md sm:min-w-[300px] ${
        isLower
          ? "border-primary/20 bg-primary/[0.05] dark:border-primary/25 dark:bg-primary/[0.08]"
          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
      }`}
    >
      <div
        className={`flex size-14 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tracking-tight ${
          isLower
            ? "border-primary/20 bg-white text-primary dark:bg-gray-950"
            : "border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
        }`}
      >
        {initials}
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-medium tracking-tight text-gray-950 dark:text-gray-50">
          {customer.name}
        </p>
        <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
          {customer.detail}
        </p>
      </div>
    </li>
  );
}

function CircularCustomerRow({
  customers,
  direction,
  tone,
  label,
}: {
  customers: Customer[];
  direction: "left" | "right";
  tone: "upper" | "lower";
  label: string;
}) {
  const duplicateCustomers = Array.from({ length: MARQUEE_REPEAT_COUNT - 1 }).flatMap(
    (_, copyIndex) => customers.map((customer) => ({ customer, copyIndex })),
  );

  return (
    <div
      aria-label={label}
      className="overflow-hidden py-3 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
    >
      <ul className={`customer-circular-track customer-circular-${direction} flex w-max gap-5`}>
        {customers.map((customer) => (
          <CustomerPill key={`${tone}-${customer.name}`} customer={customer} tone={tone} />
        ))}
        {duplicateCustomers.map(({ customer, copyIndex }) => (
          <CustomerPill
            key={`${tone}-copy-${copyIndex}-${customer.name}`}
            customer={customer}
            isDuplicate
            tone={tone}
          />
        ))}
      </ul>
    </div>
  );
}

function UpperCustomerRow() {
  return (
    <div className="rounded-[2rem] border border-gray-200/70 bg-gray-50/70 py-2 dark:border-gray-800/70 dark:bg-gray-950/40">
      <CircularCustomerRow
        customers={upperRowCustomers}
        direction="left"
        label="Upper customer categories"
        tone="upper"
      />
    </div>
  );
}

function LowerCustomerRow() {
  return (
    <div className="rounded-[2rem] border border-primary/15 bg-primary/[0.025] py-2 dark:border-primary/20 dark:bg-primary/[0.05]">
      <CircularCustomerRow
        customers={lowerRowCustomers}
        direction="right"
        label="Lower customer categories"
        tone="lower"
      />
    </div>
  );
}

export function CustomersSection() {
  return (
    <section className="relative overflow-hidden bg-background py-20 md:py-28">
      <style>{`
        @keyframes customer-circular-left {
          from { transform: translateX(0); }
          to { transform: translateX(-25%); }
        }

        @keyframes customer-circular-right {
          from { transform: translateX(-25%); }
          to { transform: translateX(0); }
        }

        .customer-circular-track {
          animation-duration: 140s;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
        }

        .customer-circular-left {
          animation-name: customer-circular-left;
        }

        .customer-circular-right {
          animation-name: customer-circular-right;
        }

        .customer-circular-track:hover {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .customer-circular-track {
            animation: none;
            transform: translateX(0);
          }
        }
      `}</style>
      <div className="mx-auto max-w-screen-xl px-4 md:px-8">
        <div className="relative mx-auto mb-12 max-w-2xl text-center">
          <div className="relative z-10">
            <h2 className="text-3xl font-normal tracking-tighter text-foreground sm:text-4xl md:text-5xl">
              Our Customers
            </h2>
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-0 mx-auto h-44 max-w-xs blur-[118px]"
            style={{
              background:
                "linear-gradient(152.92deg, rgba(var(--primary-rgb), 0.2) 4.54%, rgba(var(--primary-rgb), 0.26) 34.2%, rgba(var(--primary-rgb), 0.1) 77.55%)",
            }}
          />
        </div>

        <div className="relative space-y-8">
          <UpperCustomerRow />
          <LowerCustomerRow />
        </div>
      </div>
    </section>
  );
}

export default CustomersSection;
