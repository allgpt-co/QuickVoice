import { marketingInformation } from "@/data/marketing-information";
import {
  InformationPage,
  informationMetadata,
} from "@/components/seo/information-page";

const page = marketingInformation.careers;
export const metadata = informationMetadata(page);
export default function CareersPage() {
  return <InformationPage page={page} />;
}
