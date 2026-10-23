# Context Mode patterns

## Parse test logs
Return failures and nearby context; keep raw log bytes out of the conversation.

## Summarize HTTP responses
Extract status, relevant headers, schema errors and a small sample. Never include authorization headers or secrets.

## Repository statistics
Count files, lines, TODOs, exported symbols or tests, reporting aggregates and a few exceptions.

## Index and search
Use a stable source label and short technical queries scoped to that label.

## Security review
Treat scripts and files as untrusted; review before execution, avoid unwanted mutation, and never index credentials.
