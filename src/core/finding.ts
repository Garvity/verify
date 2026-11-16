
export type FindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export type FindingCategory =
  | "security"
  | "quality"
  | "structural"
  | "policy";

export interface Finding {
  id: string;

  ruleId: string;

  severity: FindingSeverity;

  category: FindingCategory;

  message: string;

  filePath?: string;

  line?: number;

  column?: number;

  blocking: boolean;

  remediation?: string;
}
