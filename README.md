# DevKit

A sleek collection of developer tools built with React + Vite. Runs entirely in-browser with no backend required.

## Features

| Tool | Description |
|------|-------------|
| **Debezium Diff** | Compare JSON before/after states with smart auto-extraction from Kafka/Debezium payloads |
| **JSON Key Diff** | Compare keys between two JSON objects, supporting deep and flat comparisons |
| **JWT Debugger** | Decode and inspect JWT tokens with expiration status |
| **Epoch Converter** | Convert Unix timestamps with timezone support |
| **Base64 / URL** | Encode/decode Base64 and URL strings |
| **Text Analyzer** | Count characters, words, lines, paragraphs, and bytes |
| **Text Diff** | Compare two text inputs with line + word-level diff, side-by-side or inline view |
| **Password Gen** | Generate secure random passwords with configurable options |
| **Hash Generator** | Generate MD5 and bcrypt hashes |
| **Basic Auth** | Generate HTTP headers and Nginx/Apache htpasswd entries |
| **Crontab Gen** | Generate, explain, and validate cron expressions with UTC time |
| **JSON to .env** | Convert JSON configurations to .env format securely |
| **.env to JSON** | Parse .env strings into JSON structures |
| **SMTP Checker** | Verify SMTP server connectivity and credentials |
| **JSON Beautifier** | Format and parse JSON payloads |
| **Markdown Viewer** | Edit and preview Markdown with GFM tables, task lists, and Mermaid diagrams |
| **Code Beautifier/Minifier** | Format and minify JS, CSS, HTML, and YAML code |
| **Number Converter** | Convert between decimal, hex, octal, and binary (supports BigInt) |
| **T9 Decoder** | Decode and encode T9 phone keypad sequences (multi-tap) |
| **Morse Code** | Translate text ↔ Morse, play the audio signal, and watch each dit/dah on a timing diagram |
| **Subnet Calc** | Parse IPv4 CIDR and split a network into equal-sized subnets for devops/IP planning |
| **UUID / ULID** | Generate UUID v1/v4/v5/v7, ULID, and NanoID with bulk output, format options, and copy-all |
| **Chmod Calc** | Convert between octal, symbolic, and `ls -l` permission formats; toggle bits visually with setuid/setgid/sticky support |
| **Crontab Diff** | Compare two cron expressions: human description, next 10 runs each, 24h stats, and first divergence within 7 days |

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Lucide React** - Icons

## Deployment

Deployed automatically to GitHub Pages via GitHub Actions on push to `main`.

**Live:** https://kit.runany.dev

## License

MIT
