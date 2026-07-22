---
name: secure-file-upload
description: Use when implementing uploads, downloads, file storage, OCR intake, document processing, image processing, or any file endpoint that must validate MIME, magic bytes, quotas, path safety, authorization, and resource-exhaustion limits.
---

# Secure File Upload

Use this skill whenever backend code touches files.

## Required Validation

- extension allowlist;
- real MIME validation;
- magic-byte validation;
- size cap;
- file count cap;
- tenant or user quota;
- generated storage name;
- tenant-separated storage path;
- authorization on download.

## Reject or Quarantine

- executables;
- scripts;
- HTML;
- suspicious SVG;
- double extensions;
- polyglot files;
- archive bombs;
- files that exceed CPU or memory-safe processing thresholds.

## Storage Rules

- never trust original filename for path generation;
- never expose raw filesystem path;
- never store private uploads in public web roots;
- store metadata separately from file bytes;
- use UUID or content-hash naming.

## Processing Rules

- stream uploads;
- avoid loading large files entirely into memory;
- cap OCR or image processing workers;
- validate before persistence;
- add tests for invalid MIME, invalid signature, oversized file, unauthorized download, and quota overflow;
- keep upload limits and timeouts aligned with `lumos-gateway` body and proxy constraints when those are configured.
