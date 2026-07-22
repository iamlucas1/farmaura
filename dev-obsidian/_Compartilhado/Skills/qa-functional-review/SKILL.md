---
name: qa-functional-review
description: Use for a functional QA pass over a UI feature — finding dead buttons/handlers, duplicated functions implementing the same behavior twice, missing loading/empty/error states, and orphaned routes. This tests what's built, it does not write it.
---

# QA Functional Review

Use this skill after implementing or changing a UI feature, before calling it done.

## When to Use

Any change that adds or modifies a screen, form, or interactive component, in any frontend stack of this repository.

## Checklist

- every button/link has a wired handler that does something observable — no dead click targets;
- no duplicated function/component implementing the same behavior in two places (search for similarly named handlers before adding a new one, instead of writing a second implementation of the same action);
- loading, empty, and error states are all present and visually distinguishable, not just the happy path;
- no orphaned route/component left behind after a refactor (unreachable from any nav/link);
- no console error or warning during the flow being tested;
- destructive actions (delete, cancel, refund) have an explicit confirmation step, never triggered by a bare click or page load.

## How to Review

Drive the actual screen through a browser against the running dev server, not just a code read — a dead button reads fine in the source and only fails once clicked.

## Reporting

A gap found here that isn't fixed in the same change set gets logged as a pending item in the project's backlog, not left as an unrecorded observation.
