
"use strict";

/**
 * RepoLens — Repository Health Checker
 * File: js/scanner.js
 *
 * Browser-only repository scanner.
 *
 * Public API:
 *   window.RepoScanner.scan(options)
 *
 * Supported input examples:
 *   RepoScanner.scan({ files: fileList, onProgress })
 *   RepoScanner.scan({ file: zipFile, onProgress })
 *   RepoScanner.scan({ zipFile: zipFile, onProgress })
 *
 * Returns:
 *   {
 *     repositoryName,
 *     repositoryType,
 *     fileCount,
 *     totalSize,
 *     findings,
 *     documentationStatus,
 *     configurationStatus,
 *     files,
 *     scannedAt
 *   }
 */

(function () {
    const RepoScanner = {};

    // --------------------------------------------------
    // CONFIGURATION
    // --------------------------------------------------

    const CONFIG = {
        maxFiles: 5000,
        maxTotalBytes: 100 * 1024 * 1024,
        maxFileBytes: 2 * 1024 * 1024,
        maxZipFileBytes: 100 * 1024 * 1024,
        largeFileBytes: 10 * 1024 * 1024,

        ignoredDirectories: new Set([
            ".git",
            "node_modules",
            ".venv",
            "venv",
            "__pycache__",
            ".next",
            ".nuxt",
            "coverage"
        ]),

        textExtensions: new Set([
            ".html", ".htm", ".css", ".scss", ".sass", ".less",
            ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
            ".json", ".jsonc", ".json5", ".xml", ".svg",
            ".md", ".mdx", ".txt", ".rst",
            ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf",
            ".env", ".example", ".sample",
            ".gitignore", ".gitattributes", ".editorconfig",
            ".npmrc", ".nvmrc", ".dockerignore",
            ".sh", ".bash", ".ps1", ".bat", ".cmd",
            ".py", ".java", ".cs", ".cpp", ".c", ".h", ".hpp",
            ".go", ".rs", ".php", ".rb", ".sql",
            ".vue", ".svelte", ".astro",
            ".lock", ".properties", ".gradle"
        ])
    };

    // --------------------------------------------------
    // GENERAL UTILITIES
    // --------------------------------------------------

    function normalizePath(path) {
        return String(path || "")
            .replace(/\\/g, "/")
            .replace(/^\/+/, "")
            .replace(/\/+/g, "/");
    }

    function getExtension(path) {
        const name = normalizePath(path).split("/").pop() || "";
        const index = name.lastIndexOf(".");

        return index > 0
            ? name.slice(index).toLowerCase()
            : "";
    }

    function getFileName(path) {
        return normalizePath(path).split("/").pop() || "";
    }

    function getDirectorySegments(path) {
        return normalizePath(path)
            .split("/")
            .slice(0, -1)
            .filter(Boolean);
    }

    function isIgnoredPath(path) {
        return getDirectorySegments(path).some(segment =>
            CONFIG.ignoredDirectories.has(segment.toLowerCase())
        );
    }

    function isTextFile(path) {
        const name = getFileName(path).toLowerCase();
        const extension = getExtension(path);

        if (
            name === "dockerfile" ||
            name === "makefile" ||
            name === "license" ||
            name.startsWith("readme") ||
            name.startsWith("changelog") ||
            name.startsWith("contributing") ||
            name.startsWith("code_of_conduct") ||
            name === ".gitignore" ||
            name === ".gitattributes" ||
            name === ".editorconfig" ||
            name === ".dockerignore" ||
            name === ".npmrc" ||
            name === ".nvmrc" ||
            name === ".env" ||
            name.startsWith(".env.")
        ) {
            return true;
        }

        return CONFIG.textExtensions.has(extension);
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) {
            return "0 B";
        }

        const units = ["B", "KB", "MB", "GB"];
        const index = Math.min(
            Math.floor(Math.log(bytes) / Math.log(1024)),
            units.length - 1
        );

        return `${(bytes / Math.pow(1024, index)).toFixed(
            index === 0 ? 0 : 2
        )} ${units[index]}`;
    }

    function safeCall(callback, ...args) {
        if (typeof callback !== "function") {
            return;
        }

        try {
            callback(...args);
        } catch (error) {
            // A UI callback should not break the scan itself.
            console.warn("RepoLens progress callback failed:", error);
        }
    }

    function reportProgress(callback, percentage, message, details = {}) {
        const percent = Math.max(
            0,
            Math.min(100, Math.round(percentage))
        );

        // First argument is a number for simple progress-bar integrations.
        // The second argument is a readable status message.
        // The third argument provides additional details.
        safeCall(callback, percent, message, {
            percentage: percent,
            message,
            ...details
        });
    }

    function createFinding({
        id,
        severity = "warning",
        category = "General",
        title,
        description,
        recommendation,
        file = "",
        line = null
    }) {
        return {
            id,
            severity,
            category,
            title,
            description,
            recommendation,
            file,
            line
        };
    }

    function normalizeFindingPath(path) {
        return normalizePath(path).replace(/^\.\//, "");
    }

    // --------------------------------------------------
    // INPUT NORMALIZATION
    // --------------------------------------------------

    function getInputFiles(options) {
        const candidates = [
            options.files,
            options.folderFiles,
            options.selectedFiles,
            options.fileList
        ];

        for (const candidate of candidates) {
            if (
                candidate &&
                typeof candidate !== "string" &&
                typeof candidate[Symbol.iterator] === "function"
            ) {
                return Array.from(candidate);
            }
        }

        return [];
    }

    function getZipFile(options) {
        const candidates = [
            options.zipFile,
            options.file,
            options.archive,
            options.zip
        ];

        for (const candidate of candidates) {
            if (candidate && typeof candidate === "object") {
                const name = String(candidate.name || "").toLowerCase();

                if (
                    name.endsWith(".zip") ||
                    candidate === options.zipFile ||
                    candidate === options.archive ||
                    candidate === options.zip
                ) {
                    return candidate;
                }
            }
        }

        return null;
    }

    function getRepositoryName(options, files, zipFile) {
        if (options.repositoryName || options.projectName) {
            return String(
                options.repositoryName || options.projectName
            );
        }

        if (zipFile && zipFile.name) {
            return zipFile.name.replace(/\.zip$/i, "") || "Repository";
        }

        if (files.length > 0) {
            const firstPath = normalizePath(
                files[0].webkitRelativePath ||
                files[0].relativePath ||
                files[0].name
            );

            const firstSegment = firstPath.split("/")[0];

            if (
                firstPath.includes("/") &&
                firstSegment &&
                firstSegment !== getFileName(firstPath)
            ) {
                return firstSegment;
            }
        }

        return "Repository";
    }

    // --------------------------------------------------
    // ZIP EXTRACTION
    // Requires JSZip in index.html.
    // --------------------------------------------------

    async function readZip(zipFile, onProgress) {
        if (!window.JSZip) {
            throw new Error(
                "ZIP support is not loaded. Add the JSZip script to index.html."
            );
        }

        if (zipFile.size > CONFIG.maxZipFileBytes) {
            throw new Error(
                `The ZIP archive exceeds the ${formatBytes(
                    CONFIG.maxZipFileBytes
                )} upload limit.`
            );
        }

        reportProgress(onProgress, 5, "Opening ZIP archive...");

        const zip = await window.JSZip.loadAsync(zipFile, {
            checkCRC32: false
        });

        const entries = [];

        zip.forEach((relativePath, entry) => {
            if (entry.dir || isIgnoredPath(relativePath)) {
                return;
            }

            entries.push({
                path: normalizeFindingPath(relativePath),
                entry
            });
        });

        if (entries.length === 0) {
            throw new Error(
                "No readable project files were found in the ZIP archive."
            );
        }

        if (entries.length > CONFIG.maxFiles) {
            throw new Error(
                `This archive contains more than ${CONFIG.maxFiles} files. ` +
                "Please scan a smaller project or exclude generated files."
            );
        }

        const files = [];
        let totalSize = 0;
        let processed = 0;

        for (const item of entries) {
            const entry = item.entry;
            const path = item.path;

            const declaredSize =
                entry._data &&
                Number(entry._data.uncompressedSize);

            const size = Number.isFinite(declaredSize)
                ? declaredSize
                : 0;

            totalSize += size;

            if (totalSize > CONFIG.maxTotalBytes) {
                throw new Error(
                    `The uncompressed project exceeds the ${formatBytes(
                        CONFIG.maxTotalBytes
                    )} scan limit.`
                );
            }

            let content = null;

            if (
                isTextFile(path) &&
                size <= CONFIG.maxFileBytes
            ) {
                try {
                    content = await entry.async("string");
                } catch (error) {
                    content = null;
                }
            }

            files.push({
                path,
                name: getFileName(path),
                size,
                content,
                isText: isTextFile(path)
            });

            processed++;

            reportProgress(
                onProgress,
                5 + (processed / entries.length) * 25,
                `Extracting files: ${processed}/${entries.length}`,
                {
                    current: processed,
                    total: entries.length
                }
            );
        }

        return {
            files,
            totalSize,
            source: "zip"
        };
    }

    // --------------------------------------------------
    // FOLDER / FILE READING
    // --------------------------------------------------

    async function readBrowserFiles(browserFiles, onProgress) {
        if (!browserFiles.length) {
            throw new Error(
                "No files were selected. Choose a project folder or ZIP archive."
            );
        }

        const entries = [];

        for (const file of browserFiles) {
            const path = normalizeFindingPath(
                file.webkitRelativePath ||
                file.relativePath ||
                file.name
            );

            if (!path || isIgnoredPath(path)) {
                continue;
            }

            entries.push({
                path,
                file
            });
        }

        if (!entries.length) {
            throw new Error(
                "No supported project files were found in your selection."
            );
        }

        if (entries.length > CONFIG.maxFiles) {
            throw new Error(
                `The selection exceeds the ${CONFIG.maxFiles}-file scan limit.`
            );
        }

        const files = [];
        let totalSize = 0;
        let processed = 0;

        for (const item of entries) {
            const path = item.path;
            const file = item.file;

            const size = Number(file.size) || 0;
            totalSize += size;

            if (totalSize > CONFIG.maxTotalBytes) {
                throw new Error(
                    `The selected project exceeds the ${formatBytes(
                        CONFIG.maxTotalBytes
                    )} scan limit.`
                );
            }

            let content = null;

            if (
                isTextFile(path) &&
                size <= CONFIG.maxFileBytes &&
                typeof file.text === "function"
            ) {
                try {
                    content = await file.text();
                } catch (error) {
                    content = null;
                }
            }

            files.push({
                path,
                name: getFileName(path),
                size,
                content,
                isText: isTextFile(path)
            });

            processed++;

            reportProgress(
                onProgress,
                5 + (processed / entries.length) * 25,
                `Reading files: ${processed}/${entries.length}`,
                {
                    current: processed,
                    total: entries.length
                }
            );
        }

        return {
            files,
            totalSize,
            source: "folder"
        };
    }

    // --------------------------------------------------
    // REPOSITORY STRUCTURE HELPERS
    // --------------------------------------------------

    function hasFile(files, matcher) {
        return files.some(file => matcher(file.path.toLowerCase()));
    }

    function hasReadme(files) {
        return hasFile(files, path =>
            /(^|\/)readme(?:\.[^/]+)?$/.test(path)
        );
    }

    function hasLicense(files) {
        return hasFile(files, path =>
            /(^|\/)(license|licence|copying)(?:\.[^/]+)?$/.test(path)
        );
    }

    function hasGitIgnore(files) {
        return hasFile(files, path =>
            /(^|\/)\.gitignore$/.test(path)
        );
    }

    function hasContributingGuide(files) {
        return hasFile(files, path =>
            /(^|\/)contributing(?:\.[^/]+)?$/.test(path)
        );
    }

    function hasTests(files) {
        return hasFile(files, path =>
            /(^|\/)(tests?|__tests__)(\/|$)/.test(path) ||
            /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
        );
    }

    function hasSourceDirectory(files) {
        return hasFile(files, path =>
            /(^|\/)(src|source|app|lib)(\/|$)/.test(path)
        );
    }

    function hasCIConfiguration(files) {
        return hasFile(files, path =>
            /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(path) ||
            /(^|\/)\.gitlab-ci\.yml$/.test(path) ||
            /(^|\/)azure-pipelines\.yml$/.test(path) ||
            /(^|\/)bitbucket-pipelines\.yml$/.test(path)
        );
    }

    function hasDependencyManifest(files) {
        return hasFile(files, path =>
            /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle|cargo\.toml|go\.mod|composer\.json|gemfile|\.csproj|\.sln)$/i.test(path)
        );
    }

    function hasLockFile(files) {
        return hasFile(files, path =>
            /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|pipfile\.lock|cargo\.lock|composer\.lock|gemfile\.lock)$/i.test(path)
        );
    }

    function hasEnvExample(files) {
        return hasFile(files, path =>
            /(^|\/)\.env\.(example|sample|template)$/.test(path)
        );
    }

    // --------------------------------------------------
    // STRUCTURE CHECKS
    // --------------------------------------------------

    function inspectStructure(files, findings) {
        const checks = [
            {
                present: hasReadme(files),
                id: "DOC-001",
                title: "README documentation is missing",
                category: "Documentation",
                severity: "warning",
                description:
                    "No README file was found in the repository.",
                recommendation:
                    "Add a README.md describing the project, setup, usage, and key features."
            },
            {
                present: hasLicense(files),
                id: "LEGAL-001",
                title: "License file is missing",
                category: "Repository",
                severity: "warning",
                description:
                    "No common license file was found.",
                recommendation:
                    "Choose an appropriate license and add it to the repository if you intend to distribute the project."
            },
            {
                present: hasGitIgnore(files),
                id: "GIT-001",
                title: ".gitignore file is missing",
                category: "Configuration",
                severity: "warning",
                description:
                    "No .gitignore file was found.",
                recommendation:
                    "Add a .gitignore to exclude generated files, local configuration, dependencies, and secrets."
            },
            {
                present: hasContributingGuide(files),
                id: "DOC-002",
                title: "Contributing guide is missing",
                category: "Documentation",
                severity: "info",
                description:
                    "No CONTRIBUTING guide was detected.",
                recommendation:
                    "Consider adding contribution instructions if other developers may work on this project."
            },
            {
                present: hasTests(files),
                id: "TEST-001",
                title: "No obvious test files found",
                category: "Testing",
                severity: "warning",
                description:
                    "The scanner could not identify a tests directory or common test-file naming pattern.",
                recommendation:
                    "Add automated tests where appropriate. Manual testing may also be suitable for small projects."
            },
            {
                present: hasSourceDirectory(files),
                id: "STR-001",
                title: "No conventional source directory found",
                category: "Structure",
                severity: "info",
                description:
                    "No src, source, app, or lib directory was detected.",
                recommendation:
                    "Consider grouping application code into a clear source directory if the project would benefit from it."
            },
            {
                present: hasCIConfiguration(files),
                id: "CI-001",
                title: "No CI workflow detected",
                category: "Automation",
                severity: "info",
                description:
                    "No common continuous-integration configuration was found.",
                recommendation:
                    "Consider adding automated checks for tests, linting, or deployment."
            }
        ];

        const hasManifest = hasDependencyManifest(files);

        if (!hasManifest) {
            findings.push(createFinding({
                id: "CFG-001",
                severity: "info",
                category: "Configuration",
                title: "No common dependency manifest found",
                description:
                    "The scanner did not detect a common dependency manifest. This may be normal for a static website or another lightweight project.",
                recommendation:
                    "If the project uses external packages or build tools, document or declare its dependencies."
            }));
        }

        for (const check of checks) {
            if (!check.present) {
                findings.push(createFinding(check));
            }
        }

        if (hasManifest && !hasLockFile(files)) {
            findings.push(createFinding({
                id: "CFG-002",
                severity: "info",
                category: "Configuration",
                title: "Dependency lock file not detected",
                description:
                    "A dependency manifest was found, but no common lock file was detected.",
                recommendation:
                    "For package-managed applications, consider committing the appropriate lock file to improve reproducibility."
            }));
        }

        if (!hasEnvExample(files)) {
            findings.push(createFinding({
                id: "SEC-003",
                severity: "info",
                category: "Security",
                title: "Environment variable template not detected",
                description:
                    "No .env.example, .env.sample, or .env.template file was found.",
                recommendation:
                    "If your application requires environment variables, document their names in a template without including real secret values."
            }));
        }
    }

    // --------------------------------------------------
    // SECURITY CHECKS
    // --------------------------------------------------

    function inspectSecrets(file, findings) {
        const path = file.path;
        const name = getFileName(path).toLowerCase();
        const content = file.content;

        const isEnvFile =
            /(^|\/)\.env$/.test(path.toLowerCase());

        const isEnvTemplate =
            /^\.env\.(example|sample|template)$/i.test(name);

        if (isEnvFile && !isEnvTemplate) {
            findings.push(createFinding({
                id: "SEC-001",
                severity: "warning",
                category: "Security",
                title: "Environment file detected",
                description:
                    "A .env file is present. It may contain credentials or machine-specific settings; the scanner cannot determine whether it has been committed to version control.",
                recommendation:
                    "Verify that real environment files are excluded from Git. Use a template containing placeholder values for documentation.",
                file: path
            }));
        }

        if (typeof content !== "string" || content.length === 0) {
            return;
        }

        const checks = [
            {
                id: "SEC-010",
                title: "Private key material detected",
                severity: "critical",
                pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/
            },
            {
                id: "SEC-011",
                title: "Possible AWS access key detected",
                severity: "critical",
                pattern: /\bAKIA[0-9A-Z]{16}\b/
            },
            {
                id: "SEC-012",
                title: "Possible GitHub access token detected",
                severity: "critical",
                pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/
            },
            {
                id: "SEC-013",
                title: "Possible hardcoded credential detected",
                severity: "warning",
                pattern: /(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"'\r\n]{8,}["']/i
            }
        ];

        for (const check of checks) {
            if (check.pattern.test(content)) {
                findings.push(createFinding({
                    id: check.id,
                    severity: check.severity,
                    category: "Security",
                    title: check.title,
                    description:
                        "A pattern associated with sensitive credentials was detected. This may be a false positive; the scanner does not validate whether a credential is real.",
                    recommendation:
                        "Inspect the file locally. Remove genuine credentials from the project, rotate exposed secrets, and use environment variables or a secrets manager.",
                    file: path
                }));
            }
        }
    }

    // --------------------------------------------------
    // CODE QUALITY CHECKS
    // --------------------------------------------------

    function inspectCode(file, findings) {
        const content = file.content;

        if (typeof content !== "string") {
            return;
        }

        const path = file.path;
        const extension = getExtension(path);
        const lowerName = getFileName(path).toLowerCase();

        if (file.size === 0) {
            findings.push(createFinding({
                id: "CODE-001",
                severity: "info",
                category: "Code Quality",
                title: "Empty file detected",
                description:
                    "This file contains no data.",
                recommendation:
                    "Confirm that the file is intentionally empty or remove it if it is unnecessary.",
                file: path
            }));

            return;
        }

        // Only inspect executable code for debug statements.
        const codeExtensions = new Set([
            ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
            ".py", ".java", ".cs", ".php", ".rb",
            ".go", ".rs", ".vue", ".svelte"
        ]);

        if (codeExtensions.has(extension)) {
            const debugPatterns = [
                {
                    pattern: /\bconsole\.(?:log|debug|info)\s*\(/,
                    title: "Debug logging statement detected",
                    description:
                        "A console logging statement was found in a source file.",
                    recommendation:
                        "Remove unnecessary debugging output or replace it with an appropriate logging strategy."
                },
                {
                    pattern: /\bdebugger\s*;/,
                    title: "Debugger statement detected",
                    description:
                        "A debugger statement was found in a source file.",
                    recommendation:
                        "Remove debugger statements before publishing a production build."
                }
            ];

            for (const check of debugPatterns) {
                const match = check.pattern.exec(content);

                if (match) {
                    const line = content
                        .slice(0, match.index)
                        .split("\n").length;

                    findings.push(createFinding({
                        id: check.title.startsWith("Debugger")
                            ? "CODE-003"
                            : "CODE-002",
                        severity: "info",
                        category: "Code Quality",
                        title: check.title,
                        description: check.description,
                        recommendation: check.recommendation,
                        file: path,
                        line
                    }));
                }
            }
        }

        if (
            lowerName === "package.json" ||
            lowerName === "tsconfig.json"
        ) {
            try {
                JSON.parse(content);
            } catch (error) {
                findings.push(createFinding({
                    id: "CFG-010",
                    severity: "warning",
                    category: "Configuration",
                    title: "Invalid JSON configuration",
                    description:
                        `${lowerName} could not be parsed as strict JSON.`,
                    recommendation:
                        "Check for missing commas, trailing commas, unquoted keys, or other invalid JSON syntax.",
                    file: path
                }));
            }
        }

        if (
            lowerName === "package.json" &&
            content.trim().length > 0
        ) {
            try {
                const packageData = JSON.parse(content);

                if (
                    !packageData.name ||
                    !packageData.version ||
                    !packageData.scripts
                ) {
                    findings.push(createFinding({
                        id: "CFG-011",
                        severity: "info",
                        category: "Configuration",
                        title: "Package metadata may be incomplete",
                        description:
                            "The package manifest is missing a name, version, or scripts section.",
                        recommendation:
                            "Review package.json and add the metadata and scripts needed by your project.",
                        file: path
                    }));
                }
            } catch (error) {
                // The invalid JSON finding is already reported above.
            }
        }
    }

    // --------------------------------------------------
    // FILE SIZE CHECKS
    // --------------------------------------------------

    function inspectFileSize(file, findings) {
        if (file.size > CONFIG.largeFileBytes) {
            findings.push(createFinding({
                id: "PERF-001",
                severity: "warning",
                category: "Performance",
                title: "Large file detected",
                description:
                    `This file is ${formatBytes(file.size)}. Large repository files can increase clone times and affect web performance if served directly.`,
                recommendation:
                    "Check whether the file should be optimized, compressed, stored externally, or excluded from version control.",
                file: file.path
            }));
        }

        if (
            file.size > 0 &&
            file.size <= CONFIG.maxFileBytes &&
            file.content === null &&
            isTextFile(file.path)
        ) {
            findings.push(createFinding({
                id: "SCAN-001",
                severity: "info",
                category: "Scanner",
                title: "File contents could not be inspected",
                description:
                    "The scanner could not read this text file's contents.",
                recommendation:
                    "Check that the file is readable and encoded as expected. No content-based checks were performed on it.",
                file: file.path
            }));
        }
    }

    // --------------------------------------------------
    // REPOSITORY TYPE DETECTION
    // --------------------------------------------------

    function detectRepositoryType(files) {
        const paths = files.map(file => file.path.toLowerCase());

        if (
            paths.some(path =>
                /(^|\/)package\.json$/.test(path)
            ) &&
            paths.some(path =>
                /\.(jsx|tsx)$/.test(path)
            )
        ) {
            return "JavaScript / React";
        }

        if (
            paths.some(path =>
                /(^|\/)(package\.json|vite\.config\.[^/]+|webpack\.config\.[^/]+)$/.test(path)
            ) &&
            paths.some(path => /\.(js|mjs|ts|tsx|jsx)$/.test(path))
        ) {
            return "JavaScript / Web";
        }

        if (paths.some(path => /\.(html|htm)$/.test(path))) {
            return "Website";
        }

        if (
            paths.some(path =>
                /(^|\/)(requirements\.txt|pyproject\.toml|setup\.py)$/.test(path)
            ) ||
            paths.some(path => /\.py$/.test(path))
        ) {
            return "Python";
        }

        if (
            paths.some(path =>
                /\.(cs|sln)$/.test(path)
            )
        ) {
            return "C# / .NET";
        }

        if (
            paths.some(path =>
                /\.(java|gradle)$/.test(path)
            ) ||
            paths.some(path => /(^|\/)pom\.xml$/.test(path))
        ) {
            return "Java";
        }

        if (paths.some(path => /\.go$/.test(path))) {
            return "Go";
        }

        if (paths.some(path => /\.rs$/.test(path))) {
            return "Rust";
        }

        if (
            paths.some(path => /\.php$/.test(path)) ||
            paths.some(path => /(^|\/)composer\.json$/.test(path))
        ) {
            return "PHP";
        }

        if (paths.some(path => /\.rb$/.test(path))) {
            return "Ruby";
        }

        return "General / Mixed";
    }

    // --------------------------------------------------
    // MAIN SCAN
    // --------------------------------------------------

    RepoScanner.scan = async function (options = {}) {
        if (!options || typeof options !== "object") {
            throw new TypeError("RepoScanner.scan expects an options object.");
        }

        const onProgress =
            options.onProgress ||
            options.progressCallback ||
            options.onProgressUpdate;

        reportProgress(onProgress, 0, "Preparing repository scan...");

        const browserFiles = getInputFiles(options);
        const zipFile = getZipFile(options);

        let input;

        if (zipFile) {
            input = await readZip(zipFile, onProgress);
        } else {
            input = await readBrowserFiles(browserFiles, onProgress);
        }

        const files = input.files;
        const findings = [];

        reportProgress(onProgress, 35, "Checking repository structure...");

        inspectStructure(files, findings);

        for (let index = 0; index < files.length; index++) {
            const file = files[index];

            inspectFileSize(file, findings);

            if (file.content !== null) {
                inspectSecrets(file, findings);
                inspectCode(file, findings);
            }

            const percentage = 35 + ((index + 1) / files.length) * 60;

            reportProgress(
                onProgress,
                percentage,
                `Analyzing files: ${index + 1}/${files.length}`,
                {
                    current: index + 1,
                    total: files.length
                }
            );
        }

        const readmePresent = hasReadme(files);
        const licensePresent = hasLicense(files);
        const gitIgnorePresent = hasGitIgnore(files);
        const manifestPresent = hasDependencyManifest(files);

        const repositoryName = getRepositoryName(
            options,
            browserFiles,
            zipFile
        );

        const result = {
            repositoryName,
            repositoryType: detectRepositoryType(files),

            fileCount: files.length,
            totalSize: input.totalSize,
            totalSizeFormatted: formatBytes(input.totalSize),

            findings,

            documentationStatus: readmePresent
                ? "Present"
                : "Missing",

            configurationStatus: manifestPresent
                ? "Manifest detected"
                : "No common manifest detected",

            files: files.map(file => ({
                path: file.path,
                name: file.name,
                size: file.size,
                sizeFormatted: formatBytes(file.size),
                isText: file.isText
            })),

            checks: {
                readme: readmePresent,
                license: licensePresent,
                gitIgnore: gitIgnorePresent,
                tests: hasTests(files),
                sourceDirectory: hasSourceDirectory(files),
                ciConfiguration: hasCIConfiguration(files),
                dependencyManifest: manifestPresent,
                lockFile: hasLockFile(files),
                environmentTemplate: hasEnvExample(files)
            },

            source: input.source,
            scannedAt: new Date().toISOString()
        };

        reportProgress(onProgress, 100, "Repository scan complete.", {
            fileCount: result.fileCount,
            findingCount: result.findings.length
        });

        return result;
    };

    // Optional helpers for other RepoLens modules.
    RepoScanner.formatBytes = formatBytes;
    RepoScanner.detectRepositoryType = detectRepositoryType;

    window.RepoScanner = RepoScanner;
})();
