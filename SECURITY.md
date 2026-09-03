# Security Policy

## Supported versions

CodeTracr is in public beta. The supported release is **0.1.0** on the default branch (`main` or `master`). There is no separate long-term support line yet.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository.

Include:

- a description of the issue
- steps to reproduce
- impact, if known

Please give maintainers a reasonable window to investigate before any public disclosure.

Do not file public GitHub issues for vulnerabilities.

## Scope notes

CodeTracr is a static analyzer. It reads local source trees that you point it at. Do not feed it secrets you would not store on disk. Generated graphs may include source paths and code symbols from the analyzed project.

The local server (`npm start`) is meant for a trusted machine. `/config` returns absolute filesystem paths. Do not bind it to an untrusted network.
