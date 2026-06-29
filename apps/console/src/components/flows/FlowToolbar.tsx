import { LayoutGrid, Plus, Save } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Switch } from "@/src/components/ui/switch";

interface FlowToolbarProps {
  name: string;
  description: string;
  isActive: boolean;
  canSave: boolean;
  isSaving: boolean;
  errorCount: number;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onAddAgent: () => void;
  onAddEnd: () => void;
  onAutoLayout: () => void;
  onSave: () => void;
}

export function FlowToolbar({
  name,
  description,
  isActive,
  canSave,
  isSaving,
  errorCount,
  onNameChange,
  onDescriptionChange,
  onActiveChange,
  onAddAgent,
  onAddEnd,
  onAutoLayout,
  onSave,
}: FlowToolbarProps) {
  return (
    <div className="flex w-[min(760px,calc(100vw-3rem))] flex-wrap items-end gap-2 border bg-card p-3 shadow-sm">
      <div className="min-w-48 flex-1 space-y-1">
        <Label htmlFor="flow-name" className="text-xs">Name</Label>
        <Input
          id="flow-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div className="min-w-56 flex-1 space-y-1">
        <Label htmlFor="flow-description" className="text-xs">Description</Label>
        <Input
          id="flow-description"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex h-8 items-center gap-2 px-1">
        <Switch checked={isActive} onCheckedChange={onActiveChange} size="sm" />
        <span className="text-xs font-medium">Active</span>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onAddAgent}>
        <Plus className="size-4" />
        Agent
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onAddEnd}>
        <Plus className="size-4" />
        End
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onAutoLayout}>
        <LayoutGrid className="size-4" />
        Layout
      </Button>
      <Button type="button" size="sm" onClick={onSave} disabled={!canSave || isSaving}>
        <Save className="size-4" />
        {isSaving ? "Saving" : errorCount ? `${errorCount} errors` : "Save"}
      </Button>
    </div>
  );
}
