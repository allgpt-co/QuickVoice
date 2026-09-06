import { operationalWorkflows } from "@/data/operational-workflows";
import { WorkflowPage, workflowMetadata } from "@/components/seo/workflow-page";

const page = operationalWorkflows["reminders-collections"];
export const metadata = workflowMetadata(page);
export default function Page() {
  return <WorkflowPage page={page} />;
}
