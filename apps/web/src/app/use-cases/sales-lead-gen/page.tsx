import { workflowPages } from "@/data/workflow-pages";
import { WorkflowPage, workflowMetadata } from "@/components/seo/workflow-page";

const page = workflowPages.sales!;

export const metadata = workflowMetadata(page);

export default function Page() {
  return <WorkflowPage page={page} />;
}
