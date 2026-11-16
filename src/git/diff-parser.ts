
export type ChangedLineType = "added" | "removed";

export interface ChangedLine {
  type: ChangedLineType;
  lineNumber: number;
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  changedLines: ChangedLine[];
}

export interface ParsedFileDiff {
  oldPath: string | null;
  newPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed";
  isBinary: boolean;
  hunks: DiffHunk[];
  addedLines: ChangedLine[];
  removedLines: ChangedLine[];
}

function decodeGitPath(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith('"')) {
    return trimmed;
  }

  const endQuote = trimmed.lastIndexOf('"');

  if (endQuote <= 0) {
    return trimmed;
  }

  const encoded = trimmed.slice(1, endQuote);

  return encoded.replace(
    /\\([0-7]{1,3}|.)/g,
    (_match, escape: string) => {
      if (/^[0-7]{1,3}$/.test(escape)) {
        return String.fromCharCode(
          parseInt(escape, 8)
        );
      }

      const escapes: Record<string, string> = {
        "\\": "\\",
        '"': '"',
        t: "\t",
        n: "\n",
        r: "\r",
        b: "\b",
        f: "\f",
        v: "\v"
      };

      return escapes[escape] ?? escape;
    }
  );
}


function extractPatchPath(
  line: string,
  prefix: string
): string | null {
  if (!line.startsWith(prefix)) {
    return null;
  }

  const value = line.slice(prefix.length);

  if (value === "/dev/null") {
    return null;
  }

  const path = value.startsWith('"')
    ? decodeGitPath(value)
    : value.split("\t", 1)[0];

  if (prefix === "--- " && path.startsWith("a/")) {
    return path.slice(2);
  }

  if (prefix === "+++ " && path.startsWith("b/")) {
    return path.slice(2);
  }

  return path;
}


function extractRenamePath(
  line: string,
  prefix: string
): string | null {
  if (!line.startsWith(prefix)) {
    return null;
  }

  return decodeGitPath(
    line.slice(prefix.length)
  );
}

function parseHunkHeader(
  line: string
): Omit<DiffHunk, "changedLines"> | null {
  const match = line.match(
    /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
  );

  if (!match) {
    return null;
  }

  return {
    oldStart: Number(match[1]),
    oldCount: match[2] === undefined
      ? 1
      : Number(match[2]),
    newStart: Number(match[3]),
    newCount: match[4] === undefined
      ? 1
      : Number(match[4])
  };
}

function parseFileSection(
  section: string
): ParsedFileDiff | null {
  const lines = section.split("\n");

  let oldPath: string | null = null;
  let newPath: string | null = null;

  let renameFrom: string | null = null;
  let renameTo: string | null = null;

  let isBinary = false;

  const hunks: DiffHunk[] = [];

  let currentHunk: DiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;

  for (const line of lines) {
    if (line.startsWith("rename from ")) {
      renameFrom = extractRenamePath(
        line,
        "rename from "
      );
      continue;
    }

    if (line.startsWith("rename to ")) {
      renameTo = extractRenamePath(
        line,
        "rename to "
      );
      continue;
    }

    if (line.startsWith("--- ")) {
      oldPath = extractPatchPath(line, "--- ");
      continue;
    }

    if (line.startsWith("+++ ")) {
      newPath = extractPatchPath(line, "+++ ");
      continue;
    }

    if (
      line.startsWith("Binary files ") ||
      line.startsWith("GIT binary patch")
    ) {
      isBinary = true;
      continue;
    }

    const hunkHeader = parseHunkHeader(line);

    if (hunkHeader) {
      currentHunk = {
        ...hunkHeader,
        changedLines: []
      };

      hunks.push(currentHunk);

      oldLineNumber = hunkHeader.oldStart;
      newLineNumber = hunkHeader.newStart;

      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith("\\")) {
      // Example: \ No newline at end of file
      continue;
    }

    if (line.startsWith("+")) {
      currentHunk.changedLines.push({
        type: "added",
        lineNumber: newLineNumber,
        content: line.slice(1)
      });

      newLineNumber++;
      continue;
    }

    if (line.startsWith("-")) {
      currentHunk.changedLines.push({
        type: "removed",
        lineNumber: oldLineNumber,
        content: line.slice(1)
      });

      oldLineNumber++;
      continue;
    }

    if (line.startsWith(" ")) {
      oldLineNumber++;
      newLineNumber++;
    }
  }

  if (renameFrom !== null || renameTo !== null) {
    oldPath = renameFrom ?? oldPath;
    newPath = renameTo ?? newPath;
  }

  if (oldPath === null && newPath === null) {
    return null;
  }

  const status: ParsedFileDiff["status"] =
    oldPath === null
      ? "added"
      : newPath === null
        ? "deleted"
        : renameFrom !== null || renameTo !== null
          ? "renamed"
          : "modified";

  const addedLines = hunks.flatMap((hunk) =>
    hunk.changedLines.filter(
      (line) => line.type === "added"
    )
  );

  const removedLines = hunks.flatMap((hunk) =>
    hunk.changedLines.filter(
      (line) => line.type === "removed"
    )
  );

  return {
    oldPath,
    newPath,
    status,
    isBinary,
    hunks,
    addedLines,
    removedLines
  };
}

export function parseGitDiff(
  diff: string
): ParsedFileDiff[] {
  if (diff.length === 0) {
    return [];
  }

  const sections = diff.split(
    /^(?=diff --git )/m
  );

  const parsedFiles: ParsedFileDiff[] = [];

  for (const section of sections) {
    if (!section.startsWith("diff --git ")) {
      continue;
    }

    const parsed = parseFileSection(section);

    if (parsed) {
      parsedFiles.push(parsed);
    }
  }

  return parsedFiles;
}
