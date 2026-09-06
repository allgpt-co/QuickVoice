import { marketingInformation } from "@/data/marketing-information";
import {
  InformationPage,
  informationMetadata,
} from "@/components/seo/information-page";

const page = marketingInformation.solutions;
export const metadata = informationMetadata(page);
export default function Page() {
  return <InformationPage page={page} />;
}
