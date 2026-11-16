
import {
  parseGitDiff,
  type ParsedFileDiff
} from "./diff-parser.js";

export interface ChangedFilesSummary {
  added: ParsedFileDiff[];
  modified: ParsedFileDiff[];
  deleted: ParsedFileDiff[];
  renamed: ParsedFileDiff[];
  all: ParsedFileDiff[];
}

export function getChangedFiles(
  diff: string
): ChangedFilesSummary {
  const files = parseGitDiff(diff);

  return {
    added: files.filter(
      (file) => file.status === "added"
    ),

    modified: files.filter(
      (file) => file.status === "modified"
    ),

    deleted: files.filter(
      (file) => file.status === "deleted"
    ),

    renamed: files.filter(
      (file) => file.status === "renamed"
    ),

    all: files
  };
}
