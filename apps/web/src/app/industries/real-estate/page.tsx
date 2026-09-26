import { workflowPages } from "@/data/workflow-pages";
import { workflowMetadata } from "@/components/seo/workflow-page";
import { PropertyManagementPage } from "@/components/seo/property-management-page";

const page = workflowPages.realEstate!;

export const metadata = workflowMetadata(page);

export default function Page() {
  return <PropertyManagementPage page={page} />;
}
