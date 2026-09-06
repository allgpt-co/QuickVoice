import { industryWorkflows } from "@/data/industry-workflows";
import { WorkflowPage, workflowMetadata } from "@/components/seo/workflow-page";

const page = industryWorkflows["automotive"]!;
export const metadata = workflowMetadata(page);

export default function Page() {
  return <WorkflowPage page={page} />;
}
