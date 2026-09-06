const faqs = [
  {
    question: "What should I bring to a demo?",
    answer:
      "A specific calling workflow is a useful starting point. Describe who calls, what they need, which systems hold the relevant information, and when your team should take over.",
  },
  {
    question: "Can I ask about pricing before creating an account?",
    answer:
      "Yes. Book a demo or send an enquiry about your requirements. The pricing page explains the hosted usage formula; actual costs depend on the models, phone provider, connected time, and numbers you use.",
  },
  {
    question: "Can I discuss an integration or a self-hosted deployment?",
    answer:
      "Include the system you want to connect or the deployment you want to evaluate. The team can discuss requirements, configuration, and testing. Confirm the scope before treating an integration as ready to use.",
  },
  {
    question: "Where should I send a support question?",
    answer:
      "Choose Support in the enquiry form and describe the issue without including passwords or sensitive customer information. For repository issues, use the project’s GitHub issue tracker.",
  },
];

export function ContactUsFaqSection() {
  return (
    <section className="page-section border-t border-border">
      <div className="site-container grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <h2 className="text-3xl font-semibold tracking-tight">
          Before you get in touch
        </h2>
        <div className="divide-y divide-border border-y border-border">
          {faqs.map((faq) => (
            <details key={faq.question} className="group py-1">
              <summary className="cursor-pointer py-5 pr-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                {faq.question}
              </summary>
              <p className="pb-5 pr-4 text-sm leading-7 text-muted-foreground">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
