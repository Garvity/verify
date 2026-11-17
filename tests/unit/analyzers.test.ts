
import { describe, it, expect } from "vitest";

import type { ParsedFileDiff } from "../../src/git/diff-parser.js";

import { detectSecrets } from "../../src/analyzers/security/secrets.js";
import { detectSensitiveFiles } from "../../src/analyzers/security/sensitive-files.js";
import { detectDeletedTests } from "../../src/analyzers/quality/deleted-tests.js";
import { detectDependencyChanges } from "../../src/analyzers/structural/dependency-changes.js";
import { detectConfigChanges } from "../../src/analyzers/structural/config-changes.js";
import { evaluatePolicies } from "../../src/policies/engine.js";
import { VerifyConfigSchema } from "../../src/config/schema.js";

const sampleFiles: ParsedFileDiff[] = [
  {
    oldPath: "src/auth.ts",
    newPath: "src/auth.ts",
    status: "modified",
    isBinary: false,
    hunks: [],
    addedLines: [
      {
        type: "added",
        lineNumber: 10,
        content: 'const apiKey = "ghp_123456789012345678901234";'
      }
    ],
    removedLines: []
  },
  {
    oldPath: ".env",
    newPath: ".env",
    status: "modified",
    isBinary: false,
    hunks: [],
    addedLines: [],
    removedLines: []
  },
  {
    oldPath: "tests/auth.test.ts",
    newPath: null,
    status: "deleted",
    isBinary: false,
    hunks: [],
    addedLines: [],
    removedLines: [
      {
        type: "removed",
        lineNumber: 1,
        content: "it('should authenticate', () => {});"
      }
    ]
  },
  {
    oldPath: "package.json",
    newPath: "package.json",
    status: "modified",
    isBinary: false,
    hunks: [],
    addedLines: [],
    removedLines: []
  },
  {
    oldPath: ".github/workflows/ci.yml",
    newPath: ".github/workflows/ci.yml",
    status: "modified",
    isBinary: false,
    hunks: [],
    addedLines: [],
    removedLines: []
  }
];

describe("Phase 3 analyzers", () => {
  it("should detect a possible secret", () => {
    const findings = detectSecrets(sampleFiles);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe("SECRET_GITHUB_TOKEN");
    expect(findings[0].line).toBe(10);

    // Never expose the detected credential.
    expect(findings[0].message).not.toContain("ghp_");
  });

  it("should detect sensitive files", () => {
    const findings = detectSensitiveFiles(sampleFiles);

    expect(
      findings.some((finding) =>
        finding.ruleId === "SENSITIVE_ENV_FILE"
      )
    ).toBe(true);
  });

  it("should detect deleted test files", () => {
    const findings = detectDeletedTests(sampleFiles);

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("DELETED_TEST_FILE");
  });

  it("should detect dependency changes", () => {
    const findings = detectDependencyChanges(sampleFiles);

    expect(findings).toHaveLength(1);
    expect(findings[0].filePath).toBe("package.json");
  });

  it("should detect CI workflow changes", () => {
    const findings = detectConfigChanges(sampleFiles);

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("CI_WORKFLOW_CHANGE");
  });
});

describe("Policy engine", () => {
  it("should block high severity findings", () => {
    const config = VerifyConfigSchema.parse({});

    const result = evaluatePolicies(
      [
        {
          id: "test-finding",
          ruleId: "TEST_RULE",
          severity: "high",
          category: "security",
          message: "Test finding",
          blocking: false
        }
      ],
      [],
      config
    );

    expect(result.blocked).toBe(true);
    expect(result.findings[0].blocking).toBe(true);
  });

  it("should require approval for protected files", () => {
    const config = VerifyConfigSchema.parse({
      protectedPaths: ["package.json"],
      approval: {
        requireForProtectedFiles: true
      }
    });

    const result = evaluatePolicies(
      [],
      [sampleFiles[3]],
      config
    );

    expect(result.blocked).toBe(true);
    expect(result.approvalRequiredFiles).toContain(
      "package.json"
    );
  });

  it("should not require approval for an approved path", () => {
    const config = VerifyConfigSchema.parse({
      protectedPaths: ["package.json"],
      approval: {
        requireForProtectedFiles: true
      }
    });

    const result = evaluatePolicies(
      [],
      [sampleFiles[3]],
      config,
      ["package.json"]
    );

    expect(result.approvalRequiredFiles).toHaveLength(0);
    expect(result.blocked).toBe(false);
  });
});
