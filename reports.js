
"use strict";

/**
 * RepoLens — Repository Health Checker
 * File: js/reports.js
 *
 * Responsibilities:
 * - Export complete reports as JSON.
 * - Export findings as CSV.
 * - Safely handle missing or malformed report data.
 * - Escape CSV values correctly.
 * - Trigger browser downloads without a backend.
 */

(function () {
    const RepoReports = {};

    // --------------------------------------------------
    // GENERAL HELPERS
    // --------------------------------------------------

    function getValue(object, keys, fallback = "") {
        if (!object || typeof object !== "object") {
            return fallback;
        }

        for (const key of keys) {
            if (
                Object.prototype.hasOwnProperty.call(object, key) &&
                object[key] !== undefined &&
                object[key] !== null
            ) {
                return object[key];
            }
        }

        return fallback;
    }

    function toNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number) ? number : fallback;
    }

    function formatDate(value) {
        const date = value ? new Date(value) : new Date();

        if (Number.isNaN(date.getTime())) {
            return new Date().toISOString();
        }

        return date.toISOString();
    }

    function safeFilename(value) {
        const cleaned = String(value || "repository")
            .trim()
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^\.+|\.+$/g, "")
            .slice(0, 100);

        return cleaned || "repository";
    }

    function getFindings(report) {
        if (!report || typeof report !== "object") {
            return [];
        }

        const possibleFindings = [
            report.findings,
            report.results && report.results.findings,
            report.scanResult && report.scanResult.findings,
            report.audit && report.audit.findings
        ];

        for (const findings of possibleFindings) {
            if (Array.isArray(findings)) {
                return findings;
            }
        }

        return [];
    }

    function getRepositoryName(report) {
        return String(
            getValue(
                report,
                ["repositoryName", "projectName", "name"],
                getValue(
                    report && report.scanResult,
                    ["repositoryName", "projectName", "name"],
                    "repository"
                )
            )
        );
    }

    function getScore(report) {
        const score = getValue(
            report,
            ["score", "healthScore", "overallScore"],
            getValue(
                report && report.scoring,
                ["score", "healthScore", "overallScore"],
                getValue(
                    report && report.metrics,
                    ["healthScore", "score"],
                    null
                )
            )
        );

        if (score === null || score === "") {
            return null;
        }

        return Math.max(0, Math.min(100, toNumber(score, 0)));
    }

    function normalizeSeverity(finding) {
        const rawSeverity = String(
            getValue(finding, ["severity", "level", "priority"], "info")
        ).toLowerCase();

        if (
            rawSeverity === "critical" ||
            rawSeverity === "error" ||
            rawSeverity === "high"
        ) {
            return rawSeverity === "high" ? "high" : "critical";
        }

        if (rawSeverity === "warning" || rawSeverity === "medium") {
            return "warning";
        }

        if (rawSeverity === "low") {
            return "low";
        }

        return "info";
    }

    function normalizeFinding(finding, index) {
        finding = finding && typeof finding === "object"
            ? finding
            : {};

        return {
            id: getValue(finding, ["id", "ruleId", "code"], `F-${index + 1}`),
            title: getValue(
                finding,
                ["title", "name", "message"],
                "Untitled finding"
            ),
            severity: normalizeSeverity(finding),
            category: getValue(
                finding,
                ["category", "group", "type"],
                "General"
            ),
            file: getValue(
                finding,
                ["file", "filePath", "path", "location"],
                ""
            ),
            description: getValue(
                finding,
                ["description", "details", "message"],
                ""
            ),
            recommendation: getValue(
                finding,
                ["recommendation", "suggestion", "fix", "solution"],
                ""
            ),
            line: getValue(finding, ["line", "lineNumber"], ""),
            status: getValue(finding, ["status"], "open")
        };
    }

    function collectMetrics(report, findings) {
        const scanResult = report.scanResult || {};
        const metrics = report.metrics || {};
        const scoring = report.scoring || {};

        const fileCount = toNumber(
            getValue(
                report,
                ["fileCount", "totalFiles"],
                getValue(scanResult, ["fileCount", "totalFiles"], 0)
            )
        );

        const totalSize = toNumber(
            getValue(
                report,
                ["totalSize", "projectSize", "sizeBytes"],
                getValue(scanResult, ["totalSize", "sizeBytes"], 0)
            )
        );

        const score = getScore(report);

        const countBySeverity = severity =>
            findings.filter(item => item.severity === severity).length;

        return {
            healthScore: score,
            fileCount,
            totalSizeBytes: totalSize,
            criticalFindings: countBySeverity("critical"),
            highFindings: countBySeverity("high"),
            warnings: countBySeverity("warning"),
            lowFindings: countBySeverity("low"),
            informationalFindings: countBySeverity("info"),
            passedChecks: toNumber(
                getValue(
                    report,
                    ["passedChecks", "passed"],
                    getValue(
                        scoring,
                        ["passedChecks", "passed"],
                        getValue(metrics, ["passedChecks", "passed"], 0)
                    )
                )
            )
        };
    }

    // --------------------------------------------------
    // FILE DOWNLOAD
    // --------------------------------------------------

    function downloadFile(filename, content, mimeType) {
        if (typeof document === "undefined" || typeof Blob === "undefined") {
            throw new Error("File downloads are not supported in this environment.");
        }

        const blob = new Blob([content], {
            type: `${mimeType};charset=utf-8`
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = filename;
        link.style.display = "none";

        document.body.appendChild(link);

        try {
            link.click();
        } finally {
            link.remove();

            // Delay cleanup so the browser can begin the download.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }

    // --------------------------------------------------
    // JSON REPORT
    // --------------------------------------------------

    RepoReports.buildJSON = function (report) {
        if (!report || typeof report !== "object") {
            throw new TypeError("A valid RepoLens report is required.");
        }

        const findings = getFindings(report)
            .map((finding, index) => normalizeFinding(finding, index));

        const repositoryName = getRepositoryName(report);
        const createdAt = formatDate(
            getValue(report, ["createdAt", "timestamp", "scannedAt"], null)
        );

        const metrics = collectMetrics(report, findings);

        return {
            application: {
                name: "RepoLens",
                description: "Repository Health Checker",
                reportVersion: "1.0.0"
            },

            report: {
                generatedAt: new Date().toISOString(),
                scanTimestamp: createdAt,
                repositoryName,
                healthScore: metrics.healthScore,
                summary: {
                    fileCount: metrics.fileCount,
                    totalSizeBytes: metrics.totalSizeBytes,
                    passedChecks: metrics.passedChecks,
                    criticalFindings: metrics.criticalFindings,
                    highFindings: metrics.highFindings,
                    warnings: metrics.warnings,
                    lowFindings: metrics.lowFindings,
                    informationalFindings: metrics.informationalFindings,
                    totalFindings: findings.length
                }
            },

            repository: {
                name: repositoryName,
                type: getValue(
                    report,
                    ["repositoryType", "projectType", "type"],
                    getValue(report.scanResult, ["repositoryType", "type"], "Unknown")
                ),
                fileCount: metrics.fileCount,
                totalSizeBytes: metrics.totalSizeBytes,
                documentationStatus: getValue(
                    report,
                    ["documentationStatus"],
                    getValue(report.scanResult, ["documentationStatus"], "Unknown")
                ),
                configurationStatus: getValue(
                    report,
                    ["configurationStatus"],
                    getValue(report.scanResult, ["configurationStatus"], "Unknown")
                )
            },

            findings,

            recommendations: Array.isArray(report.recommendations)
                ? report.recommendations
                : Array.isArray(report.recommendationList)
                    ? report.recommendationList
                    : [],

            metadata: {
                exportedBy: "RepoLens",
                format: "JSON",
                includesFindings: true
            }
        };
    };

    RepoReports.exportJSON = function (report) {
        const jsonReport = RepoReports.buildJSON(report);

        const filename =
            `repolens-${safeFilename(jsonReport.repository.name)}-report.json`;

        const content = JSON.stringify(jsonReport, null, 2);

        downloadFile(filename, content, "application/json");

        return jsonReport;
    };

    // --------------------------------------------------
    // CSV HELPERS
    // --------------------------------------------------

    function escapeCSV(value) {
        if (value === null || value === undefined) {
            return '""';
        }

        let textValue;

        if (typeof value === "object") {
            textValue = JSON.stringify(value);
        } else {
            textValue = String(value);
        }

        // Protect spreadsheet users against formula injection.
        if (/^[\t\r ]*[=+\-@]/.test(textValue)) {
            textValue = "'" + textValue;
        }

        return `"${textValue.replace(/"/g, '""')}"`;
    }

    function toCSV(headers, rows) {
        const lines = [
            headers.map(escapeCSV).join(","),
            ...rows.map(row => row.map(escapeCSV).join(","))
        ];

        // UTF-8 BOM helps spreadsheet programs detect Unicode correctly.
        return "\uFEFF" + lines.join("\r\n");
    }

    // --------------------------------------------------
    // CSV FINDINGS EXPORT
    // --------------------------------------------------

    RepoReports.buildCSV = function (report) {
        if (!report || typeof report !== "object") {
            throw new TypeError("A valid RepoLens report is required.");
        }

        const findings = getFindings(report)
            .map((finding, index) => normalizeFinding(finding, index));

        const headers = [
            "Finding ID",
            "Repository",
            "Severity",
            "Category",
            "Title",
            "File",
            "Line",
            "Description",
            "Recommendation",
            "Status"
        ];

        const repositoryName = getRepositoryName(report);

        const rows = findings.map(finding => [
            finding.id,
            repositoryName,
            finding.severity,
            finding.category,
            finding.title,
            finding.file,
            finding.line,
            finding.description,
            finding.recommendation,
            finding.status
        ]);

        return toCSV(headers, rows);
    };

    RepoReports.exportCSV = function (report) {
        const repositoryName = getRepositoryName(report);
        const csv = RepoReports.buildCSV(report);

        const filename =
            `repolens-${safeFilename(repositoryName)}-findings.csv`;

        downloadFile(filename, csv, "text/csv");

        return csv;
    };

    // --------------------------------------------------
    // OPTIONAL SUMMARY EXPORT
    // --------------------------------------------------

    RepoReports.exportSummaryCSV = function (report) {
        if (!report || typeof report !== "object") {
            throw new TypeError("A valid RepoLens report is required.");
        }

        const findings = getFindings(report)
            .map((finding, index) => normalizeFinding(finding, index));

        const metrics = collectMetrics(report, findings);

        const headers = ["Metric", "Value"];

        const rows = [
            ["Application", "RepoLens"],
            ["Repository", getRepositoryName(report)],
            ["Health Score", metrics.healthScore ?? "Not calculated"],
            ["Files Scanned", metrics.fileCount],
            ["Project Size (bytes)", metrics.totalSizeBytes],
            ["Passed Checks", metrics.passedChecks],
            ["Critical Findings", metrics.criticalFindings],
            ["High Findings", metrics.highFindings],
            ["Warnings", metrics.warnings],
            ["Low Findings", metrics.lowFindings],
            ["Informational Findings", metrics.informationalFindings],
            ["Total Findings", findings.length],
            ["Exported At", new Date().toISOString()]
        ];

        const csv = toCSV(headers, rows);

        const filename =
            `repolens-${safeFilename(getRepositoryName(report))}-summary.csv`;

        downloadFile(filename, csv, "text/csv");

        return csv;
    };

    // --------------------------------------------------
    // PUBLIC API
    // --------------------------------------------------

    window.RepoReports = RepoReports;
})();
