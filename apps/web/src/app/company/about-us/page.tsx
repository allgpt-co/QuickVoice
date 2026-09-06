import { marketingInformation } from "@/data/marketing-information";
import {
  InformationPage,
  informationMetadata,
} from "@/components/seo/information-page";

const page = marketingInformation.about;
export const metadata = informationMetadata(page);

export default function AboutUsPage() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QuickVoice",
    url: "https://quickvoice.co",
    logo: "https://quickvoice.co/logo.svg",
    sameAs: [
      "https://www.linkedin.com/company/quickvoiceai",
      "https://github.com/allgpt-co/QuickVoice",
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <InformationPage page={page} />
    </>
  );
}
