import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  readGitDiff: vi.fn(),
  parseGitDiff: vi.fn(),
  readWorkingTreeFiles: vi.fn(),
  detectSecrets: vi.fn(),
  detectSensitiveFiles: vi.fn(),
  detectDangerousPatterns: vi.fn(),
  detectDeletedTests: vi.fn(),
  runQualityCheck: vi.fn(),
  detectDependencyChanges: vi.fn(),
  detectConfigChanges: vi.fn(),
  evaluatePolicies: vi.fn(),
  reviewChanges: vi.fn()
}));

vi.mock("../../src/config/loader.js", () => ({ loadConfig: mocks.loadConfig }));
vi.mock("../../src/git/diff-reader.js", () => ({ readGitDiff: mocks.readGitDiff }));
vi.mock("../../src/git/diff-parser.js", () => ({ parseGitDiff: mocks.parseGitDiff }));
vi.mock("../../src/git/full-scan-reader.js", () => ({ readWorkingTreeFiles: mocks.readWorkingTreeFiles }));
vi.mock("../../src/analyzers/security/secrets.js", () => ({ detectSecrets: mocks.detectSecrets }));
vi.mock("../../src/analyzers/security/sensitive-files.js", () => ({ detectSensitiveFiles: mocks.detectSensitiveFiles }));
vi.mock("../../src/analyzers/security/dangerous-patterns.js", () => ({ detectDangerousPatterns: mocks.detectDangerousPatterns }));
vi.mock("../../src/analyzers/quality/deleted-tests.js", () => ({ detectDeletedTests: mocks.detectDeletedTests }));
vi.mock("../../src/analyzers/quality/command-check.js", () => ({ runQualityCheck: mocks.runQualityCheck }));
vi.mock("../../src/analyzers/structural/dependency-changes.js", () => ({ detectDependencyChanges: mocks.detectDependencyChanges }));
vi.mock("../../src/analyzers/structural/config-changes.js", () => ({ detectConfigChanges: mocks.detectConfigChanges }));
vi.mock("../../src/policies/engine.js", () => ({ evaluatePolicies: mocks.evaluatePolicies }));
vi.mock("../../src/ai/review/reviewer.js", () => ({ reviewChanges: mocks.reviewChanges }));

import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { runVerification } from "../../src/core/orchestrator.js";

const deterministicFinding = {
  id: "DETERMINISTIC:CHECK",
  ruleId: "CHECK",
  severity: "medium" as const,
  category: "quality" as const,
  message: "Deterministic issue",
  filePath: "src/example.ts",
  line: 2,
  blocking: false
};
const aiFinding = {
  ...deterministicFinding,
  id: "AI_REVIEW:REVIEW:src/example.ts:2:1",
  ruleId: "REVIEW",
  message: "AI issue with evidence",
  source: "ai" as const,
  confidence: 0.84,
  evidence: [{ filePath: "src/example.ts", line: 2, snippet: "const value = input;", explanation: "Input is unvalidated." }]
};
const file = {
  oldPath: "src/example.ts",
  newPath: "src/example.ts",
  status: "modified" as const,
  isBinary: false,
  hunks: [],
  addedLines: [{ type: "added" as const, lineNumber: 2, content: "const value = input;" }],
  removedLines: []
};

describe("verification with optional AI review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockResolvedValue(DEFAULT_CONFIG);
    mocks.readGitDiff.mockResolvedValue("diff");
    mocks.parseGitDiff.mockReturnValue([file]);
    mocks.readWorkingTreeFiles.mockResolvedValue([file]);
    mocks.detectSecrets.mockReturnValue([]);
    mocks.detectSensitiveFiles.mockReturnValue([]);
    mocks.detectDangerousPatterns.mockReturnValue([]);
    mocks.detectDeletedTests.mockReturnValue([]);
    mocks.detectDependencyChanges.mockReturnValue([]);
    mocks.detectConfigChanges.mockReturnValue([]);
    mocks.evaluatePolicies.mockReturnValue({ findings: [deterministicFinding], blocked: false });
    mocks.reviewChanges.mockResolvedValue({
      findings: [aiFinding],
      review: { status: "completed", model: "auto", servedModel: "review-model", durationMs: 12 },
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, cachedInputTokens: null, reasoningTokens: null }
    });
  });

  it("keeps deterministic verification independent of review credentials", async () => {
    const result = await runVerification();
    expect(result.status).toBe("passed");
    expect(result.findings).toEqual([{ ...deterministicFinding, source: "deterministic" }]);
    expect(result.aiReview).toBeUndefined();
    expect(mocks.reviewChanges).not.toHaveBeenCalled();
  });

  it("returns both sources and evidence while preserving deterministic status", async () => {
    const result = await runVerification({ aiReview: true });
    expect(result.status).toBe("passed");
    expect(result.findings.map((finding) => finding.source)).toEqual(["deterministic", "ai"]);
    expect(result.findings[1]).toMatchObject({ confidence: 0.84, evidence: aiFinding.evidence, blocking: false });
    expect(result.aiReview).toMatchObject({ status: "completed", servedModel: "review-model" });
    expect(result.summary.totalFindings).toBe(2);
    expect(result.summary.blockingFindings).toBe(0);
  });

  it("does not allow full scans to send the entire repository to the reviewer", async () => {
    const result = await runVerification({ all: true, aiReview: true });
    expect(result.status).toBe("passed");
    expect(result.aiReview).toMatchObject({ status: "skipped", errorCode: "full_scan_not_supported" });
    expect(mocks.reviewChanges).not.toHaveBeenCalled();
  });
});
