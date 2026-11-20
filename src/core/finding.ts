
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

export interface FindingEvidence {
  filePath: string;
  line: number;
  snippet: string;
  explanation: string;
}

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

  /** Origin of the result. Omitted only by legacy inputs; reports treat it as deterministic. */
  source?: "deterministic" | "ai";

  /** AI reviewer confidence in [0, 1]. Deterministic findings leave this unset. */
  confidence?: number;

  /** Evidence excerpts supporting the finding. AI excerpts are checked against submitted changes. */
  evidence?: FindingEvidence[];
}
