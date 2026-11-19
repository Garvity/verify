# Targeted security detection measurements

The adversarial analyzer suite contains four seeded cases: a GitHub token, dynamic evaluation, a credentials filename and a deleted test file. All four expected rules are detected (4/4, 100%) in the current targeted suite.

Four benign samples exercise ordinary authentication code, a safe evaluate helper name, a source file named secrets.ts and an existing test declaration. The analyzers emit no findings for these samples (0/4 false-positive cases, 0%).

These figures describe only the small named sample set. They are regression measurements, not estimates of real-world vulnerability recall or false-positive rates. Add diverse fixtures before making broader claims.

Run the measurements with:

    pnpm test:security

Agent boundary adversarial cases separately verify traversal, symlink escape, secret read and verification-control write rejection.
