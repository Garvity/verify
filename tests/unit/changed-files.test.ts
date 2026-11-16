
import { describe, it, expect } from "vitest";
import { getChangedFiles } from "../../src/git/changed-files.js";

describe("getChangedFiles", () => {
  it("should categorize added, modified and deleted files", () => {
    const diff = `diff --git a/modified.txt b/modified.txt
--- a/modified.txt
+++ b/modified.txt
@@ -1 +1 @@
-old
+new
diff --git a/added.txt b/added.txt
new file mode 100644
--- /dev/null
+++ b/added.txt
@@ -0,0 +1 @@
+new
diff --git a/deleted.txt b/deleted.txt
deleted file mode 100644
--- a/deleted.txt
+++ /dev/null
@@ -1 +0,0 @@
-old
`;

    const result = getChangedFiles(diff);

    expect(result.all).toHaveLength(3);
    expect(result.added).toHaveLength(1);
    expect(result.modified).toHaveLength(1);
    expect(result.deleted).toHaveLength(1);
    expect(result.renamed).toHaveLength(0);
  });
});
