"use client";

import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useCallback } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  CampaignIntelligenceFieldType,
  CampaignIntelligenceSource,
  CampaignIntelligenceMissingBehavior,
  type CampaignPersonalizationSchema,
} from "@/src/lib/api/resources/outbound";

export interface PersonalizationField {
  id: string;
  name: string;
  type: CampaignIntelligenceFieldType;
  source: CampaignIntelligenceSource;
  required: boolean;
  sensitive?: boolean;
  missingBehavior: CampaignIntelligenceMissingBehavior;
  invalidBehavior: CampaignIntelligenceMissingBehavior;
  defaultValue?: string | number | boolean;
  description?: string;
  maxLength?: number;
  allowedValues?: string[];
}

interface PersonalizationFieldBuilderProps {
  value: PersonalizationField[];
  onChange: (fields: PersonalizationField[]) => void;
  templates?: {
    prompt?: string;
    firstMessage?: string;
    systemPrompt?: string;
  };
  onTemplatesChange?: (templates: {
    prompt?: string;
    firstMessage?: string;
    systemPrompt?: string;
  }) => void;
}

const FIELD_TYPES: { value: CampaignIntelligenceFieldType; label: string }[] = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes/No" },
  { value: "date", label: "Date" },
  { value: "enum", label: "Dropdown Options" },
];

const FIELD_SOURCES: { value: CampaignIntelligenceSource; label: string; description: string }[] = [
  { value: "customer_attribute", label: "From CSV", description: "Value comes from CSV column" },
  { value: "campaign_constant", label: "Fixed Value", description: "Same value for all recipients" },
  { value: "computed_safe", label: "Computed", description: "Calculated from other fields" },
];

const MISSING_BEHAVIORS: { value: CampaignIntelligenceMissingBehavior; label: string; description: string }[] = [
  { value: "fallback", label: "Use Default", description: "Use a fallback value if missing" },
  { value: "omit", label: "Skip Field", description: "Leave field empty in template" },
  { value: "skip", label: "Skip Recipient", description: "Don't call this recipient" },
];

function generateId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyField(): PersonalizationField {
  return {
    id: generateId(),
    name: "",
    type: "string",
    source: "customer_attribute",
    required: false,
    sensitive: false,
    missingBehavior: "omit",
    invalidBehavior: "skip",
    description: "",
  };
}

function FieldEditor({
  field,
  onChange,
  onDelete,
  isExpanded,
  onToggleExpand,
}: {
  field: PersonalizationField;
  onChange: (field: PersonalizationField) => void;
  onDelete: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const hasError = !field.name.trim();
  
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          title="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
        
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-2 text-left"
        >
          {hasError ? (
            <AlertCircle className="size-4 text-destructive" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-500" />
          )}
          <span className="font-medium text-sm">
            {field.name.trim() || "New Field"}
          </span>
          {field.required && (
            <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
              Required
            </span>
          )}
          {field.sensitive && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
              Sensitive
            </span>
          )}
        </button>
        
        <Select
          value={field.type}
          onValueChange={(value) => onChange({ ...field, type: value as CampaignIntelligenceFieldType })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleExpand}
        >
          {isExpanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
        
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      
      {isExpanded && (
        <div className="p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Field Name *</Label>
              <Input
                placeholder="e.g., customer_name"
                value={field.name}
                onChange={(e) => onChange({ ...field, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use lowercase with underscores. This matches your CSV column name.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Where does this value come from?</Label>
              <Select
                value={field.source}
                onValueChange={(value) => onChange({ ...field, source: value as CampaignIntelligenceSource })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_SOURCES.map((source) => (
                    <SelectItem key={source.value} value={source.value}>
                      <div className="flex flex-col items-start">
                        <span>{source.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {FIELD_SOURCES.find(s => s.value === field.source)?.description}
              </p>
            </div>
          </div>
          
          {field.type === "enum" && (
            <div className="space-y-2">
              <Label>Dropdown Options</Label>
              <Input
                placeholder="Option 1, Option 2, Option 3"
                value={field.allowedValues?.join(", ") || ""}
                onChange={(e) => onChange({ 
                  ...field, 
                  allowedValues: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                })}
              />
              <p className="text-xs text-muted-foreground">
                Separate options with commas
              </p>
            </div>
          )}
          
          {field.type === "string" && (
            <div className="space-y-2">
              <Label>Maximum Length</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                placeholder="120"
                value={field.maxLength ?? ""}
                onChange={(e) => onChange({ 
                  ...field, 
                  maxLength: e.target.value ? Number(e.target.value) : undefined 
                })}
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              placeholder="What this field is used for"
              value={field.description || ""}
              onChange={(e) => onChange({ ...field, description: e.target.value })}
            />
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>If value is missing</Label>
              <Select
                value={field.missingBehavior}
                onValueChange={(value) => onChange({ 
                  ...field, 
                  missingBehavior: value as CampaignIntelligenceMissingBehavior 
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MISSING_BEHAVIORS.map((behavior) => (
                    <SelectItem key={behavior.value} value={behavior.value}>
                      <div className="flex flex-col items-start">
                        <span>{behavior.label}</span>
                        <span className="text-xs text-muted-foreground">{behavior.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>If value is invalid</Label>
              <Select
                value={field.invalidBehavior}
                onValueChange={(value) => onChange({ 
                  ...field, 
                  invalidBehavior: value as CampaignIntelligenceMissingBehavior 
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MISSING_BEHAVIORS.map((behavior) => (
                    <SelectItem key={behavior.value} value={behavior.value}>
                      {behavior.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {field.missingBehavior === "fallback" && (
            <div className="space-y-2">
              <Label>Default Value</Label>
              <Input
                placeholder="Value to use if missing"
                value={field.defaultValue?.toString() || ""}
                onChange={(e) => onChange({ ...field, defaultValue: e.target.value })}
              />
            </div>
          )}
          
          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ ...field, required: e.target.checked })}
                className="size-4 rounded border-gray-300"
              />
              <span className="text-sm">Required field</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={field.sensitive}
                onChange={(e) => onChange({ ...field, sensitive: e.target.checked })}
                className="size-4 rounded border-gray-300"
              />
              <span className="text-sm">Sensitive data (PII/PHI)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export function PersonalizationFieldBuilder({
  value,
  onChange,
  templates,
  onTemplatesChange,
}: PersonalizationFieldBuilderProps) {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  
  const handleAddField = useCallback(() => {
    const newField = createEmptyField();
    onChange([...value, newField]);
    setExpandedFields(new Set([...expandedFields, newField.id]));
  }, [value, onChange, expandedFields]);
  
  const handleFieldChange = useCallback((index: number, field: PersonalizationField) => {
    const newValue = [...value];
    newValue[index] = field;
    onChange(newValue);
  }, [value, onChange]);
  
  const handleFieldDelete = useCallback((index: number) => {
    const newValue = value.filter((_, i) => i !== index);
    onChange(newValue);
  }, [value, onChange]);
  
  const toggleExpand = useCallback((id: string) => {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Personalization Fields</h3>
          <p className="text-xs text-muted-foreground">
            Define fields that will be filled from your CSV data
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddField}
        >
          <Plus className="size-4" />
          Add Field
        </Button>
      </div>
      
      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No fields defined yet. Click &quot;Add Field&quot; to start.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((field, index) => (
            <FieldEditor
              key={field.id}
              field={field}
              onChange={(f) => handleFieldChange(index, f)}
              onDelete={() => handleFieldDelete(index)}
              isExpanded={expandedFields.has(field.id)}
              onToggleExpand={() => toggleExpand(field.id)}
            />
          ))}
        </div>
      )}
      
      {templates && onTemplatesChange && (
        <div className="space-y-3 pt-4 border-t">
          <h4 className="text-sm font-semibold">Message Templates</h4>
          <p className="text-xs text-muted-foreground">
            Use {`{{field_name}}`} to insert personalization variables
          </p>
          
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>First Message</Label>
              <Textarea
                placeholder="Hi {{customer_name}}, this is a call from..."
                rows={3}
                value={templates.firstMessage || ""}
                onChange={(e) => onTemplatesChange({ ...templates, firstMessage: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                placeholder="You are calling {{customer_name}} about..."
                rows={4}
                value={templates.prompt || ""}
                onChange={(e) => onTemplatesChange({ ...templates, prompt: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function fieldsToSchema(fields: PersonalizationField[]): CampaignPersonalizationSchema {
  return {
    version: 1,
    fields: fields.map((f) => ({
      name: f.name,
      type: f.type,
      source: f.source,
      required: f.required,
      sensitive: f.sensitive,
      missingBehavior: f.missingBehavior,
      invalidBehavior: f.invalidBehavior,
      defaultValue: f.defaultValue,
      description: f.description,
      maxLength: f.maxLength,
      allowedValues: f.allowedValues,
    })),
    templates: {},
    attribution: {},
  };
}

export function schemaToFields(schema: CampaignPersonalizationSchema): PersonalizationField[] {
  return schema.fields.map((f, index) => ({
    id: `field_${index}_${Date.now()}`,
    name: f.name,
    type: f.type,
    source: f.source,
    required: f.required,
    sensitive: f.sensitive ?? false,
    missingBehavior: f.missingBehavior ?? "omit",
    invalidBehavior: f.invalidBehavior ?? "skip",
    defaultValue: f.defaultValue,
    description: f.description,
    maxLength: f.maxLength,
    allowedValues: f.allowedValues,
  }));
}