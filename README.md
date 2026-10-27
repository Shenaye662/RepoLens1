
# RepoLens — Repository Health Checker

<p align="center">
  <strong>Know your repository before you publish it.</strong>
</p>

<p align="center">
  A lightweight, browser-based developer tool that scans project
  structures, identifies common repository issues, and generates
  actionable health reports.
</p>


---

## Overview

RepoLens helps developers evaluate the organization and publishing
readiness of their projects before sharing them on GitHub.

Instead of manually searching through folders for missing documentation,
configuration problems, exposed credentials, and leftover debugging code,
RepoLens performs a local scan and presents its findings in one place.

The application is built with HTML, CSS, and vanilla JavaScript.
It runs in the browser without requiring a custom backend.

## Features

- **Repository scanning** — Inspect project files selected from a folder
  or ZIP archive.
- **Structure analysis** — Identify missing README files, licenses,
  `.gitignore` files, and other common project essentials.
- **Security indicators** — Flag patterns that may indicate exposed
  credentials or private keys.
- **Code quality checks** — Detect selected debugging statements,
  empty files, and malformed JSON configuration files.
- **Health scoring** — Calculate a score out of 100 using configurable
  severity-based penalties.
- **Prioritized recommendations** — Turn scan findings into a list of
  suggested improvements.
- **Report exports** — Export findings as CSV and scan summaries as JSON.
- **Responsive interface** — Designed for desktop and smaller screens.
- **Privacy-conscious scanning** — Process selected files locally in
  the browser rather than uploading the project to a custom server.

> Security findings are pattern-based and may include false positives.
> RepoLens is a repository review aid, not a complete security scanner.

## Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | Layout, styling, and responsive design |
| JavaScript | Scanning, scoring, and report generation |
| JSZip | Reading ZIP archives in the browser |
| Browser File API | Accessing user-selected project files |
| Blob API | Generating downloadable reports |

## Getting Started

### Prerequisites

- A modern web browser.
- A code editor, such as Visual Studio 2022 or Visual Studio Code.
- An internet connection to load JSZip from its CDN when scanning ZIP files.

### Installation

1. Clone or download this repository.
2. Open the project folder in your preferred editor.
3. Open `index.html` in a browser, or run it through a local development server.
4. Select a project folder or ZIP archive using the application interface.
5. Start a scan and review the generated findings.

No Node.js installation or custom backend is required for the browser-based version.

### Running locally

You can use Visual Studio's available local web-server options, or use
another static file server.

If you open `index.html` directly, folder selection and downloads may work
in your browser, but using a local server is recommended for consistent
testing.

## Project Structure

```text
RepoLens/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── scanner.js
│   ├── scoring.js
│   └── reports.js
├── assets/
│   └── logo.svg
├── README.md
└── LICENSE
```

## How It Works

1. **Select a project** — Choose the files you want RepoLens to inspect.
2. **Scan the repository** — Analyze supported file names, project
   structure, and readable text content.
3. **Review findings** — Examine detected issues by severity and category.
4. **Calculate repository health** — Apply the scoring rules to the
   findings.
5. **Improve the project** — Follow the recommendations to address
   potential problems.
6. **Export a report** — Save findings and summary information for
   later review.

## Health Score

RepoLens starts with a score of 100 and subtracts penalties based on
the severity of detected findings.

| Severity | Penalty per finding |
|---|---:|
| Critical | 25 points |
| High | 15 points |
| Warning | 7 points |
| Low | 3 points |
| Informational | 0 points |

Penalties have configured limits to prevent repeated findings from
reducing the score without bound.

The score is a heuristic indicator of repository hygiene. It is not
a formal security rating or a guarantee that a project is ready for
production.

## Supported Checks

RepoLens currently includes checks for:

- Missing README documentation.
- Missing license and `.gitignore` files.
- Missing common testing and CI configuration indicators.
- Missing dependency manifests and lock files where applicable.
- Possible credential and private-key patterns.
- Debug logging and debugger statements.
- Empty and unusually large files.
- Invalid strict JSON in selected configuration files.
- General project structure and documentation recommendations.

The checks are based on recognizable file names and patterns. A project
may use a different structure or technology and still be perfectly valid.

## Privacy and Security

RepoLens is designed to inspect user-selected files locally in the browser.

- Project files are not intentionally uploaded to a custom RepoLens server.
- File selection is controlled by the user.
- Detected credentials should be treated as potentially sensitive.
- Findings should be reviewed manually before making changes.
- Do not use a scan result as proof that a repository contains no secrets.

The ZIP library is loaded from a third-party CDN in the default setup.
Review and pin dependencies appropriately if you adapt this project for
sensitive or professional environments.

## Limitations

- Only selected files are analyzed.
- Binary files are counted but are not inspected as source text.
- Large text files may be skipped to keep browser resource use manageable.
- Credential detection uses patterns and cannot validate whether a secret
  is active or genuine.
- The health score depends on the implemented checks and penalty rules.
- No backend, remote Git repository integration, or automated code execution
  is included in this version.
- A clean report does not guarantee that code is secure, correct, or
  production-ready.

## Screenshots

Add screenshots of your working application here.

Suggested screenshots:

- Main dashboard.
- Repository scan in progress.
- Results and health score.
- Detailed findings.
- Exported report options.

For example, if you create a `screenshots` folder and add `dashboard.png`:

```markdown
![RepoLens dashboard](screenshots/dashboard.png)
```

## Future Improvements

Potential additions for future versions include:

- More language-specific checks.
- Configurable scoring rules.
- Historical scan comparisons.
- Improved secret-detection patterns.
- Dependency vulnerability checks.
- Downloadable HTML reports.
- Automated tests for the scanning and scoring modules.
- GitHub Actions integration.
- Accessibility improvements and keyboard navigation.

## Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test the changes in a browser.
5. Submit a pull request describing the improvement.

Please do not submit real API keys, passwords, or other secrets in
issues, test files, screenshots, or pull requests.

## License

This project is distributed under the MIT License.
See the [LICENSE](LICENSE) file for details.

## Author

Created as a developer portfolio project to explore repository analysis,
browser-based file processing, security indicators, and automated reporting.
