
import { describe, it, expect } from "vitest";
import { parseGitDiff } from "../../src/git/diff-parser.js";

describe("parseGitDiff", () => {
  it("should parse modified files and changed line numbers", () => {
    const diff = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..abcdefg 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,3 +10,4 @@
 function login() {
-  return false;
+  const authenticated = true;
+  return authenticated;
 }
`;

    const result = parseGitDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("modified");
    expect(result[0].oldPath).toBe("src/auth.ts");
    expect(result[0].newPath).toBe("src/auth.ts");

    expect(result[0].addedLines).toHaveLength(2);
    expect(result[0].removedLines).toHaveLength(1);

    expect(result[0].addedLines[0].lineNumber).toBe(11);
    expect(result[0].addedLines[1].lineNumber).toBe(12);
    expect(result[0].removedLines[0].lineNumber).toBe(11);
  });

  it("should parse newly added files", () => {
    const diff = `diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
`;

    const result = parseGitDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("added");
    expect(result[0].oldPath).toBeNull();
    expect(result[0].newPath).toBe("new.txt");
    expect(result[0].addedLines).toHaveLength(2);
  });

  it("should parse deleted files", () => {
    const diff = `diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-hello
-world
`;

    const result = parseGitDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("deleted");
    expect(result[0].oldPath).toBe("old.txt");
    expect(result[0].newPath).toBeNull();
    expect(result[0].removedLines).toHaveLength(2);
  });

  it("should parse renamed files", () => {
    const diff = `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
`;

    const result = parseGitDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("renamed");
    expect(result[0].oldPath).toBe("old.txt");
    expect(result[0].newPath).toBe("new.txt");
  });

  it("should handle multiple hunks", () => {
    const diff = `diff --git a/example.ts b/example.ts
index 1234567..abcdefg 100644
--- a/example.ts
+++ b/example.ts
@@ -1,2 +1,2 @@
 first
-old second
+new second
@@ -10,2 +10,2 @@
 old tenth
-old eleventh
+new eleventh
`;

    const result = parseGitDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0].hunks).toHaveLength(2);
    expect(result[0].addedLines).toHaveLength(2);

    expect(result[0].addedLines[0].lineNumber).toBe(2);
    expect(result[0].addedLines[1].lineNumber).toBe(11);
  });

  it("should return an empty array for an empty diff", () => {
    expect(parseGitDiff("")).toEqual([]);
  });
});
