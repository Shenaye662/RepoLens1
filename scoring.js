
"use strict";

/**
 * RepoLens — Repository Health Checker
 * File: js/scoring.js
 *
 * Responsibilities:
 * - Calculate a repository health score out of 100.
 * - Group findings by severity and category.
 * - Calculate passed checks and repository readiness.
 * - Generate prioritized recommendations.
 * - Return dashboard-friendly scoring data.
 *
 * Public API:
 *   window.RepoScoring.calculate(scanResult)
 */

(function () {
    const RepoScoring = {};

    // --------------------------------------------------
    // SCORING CONFIGURATION
    // --------------------------------------------------

    const CONFIG = {
        startingScore: 100,

        // Penalty applied for each finding.
        severityPenalties: {
            critical: 25,
            high: 15,
            warning: 7,
            low: 3,
            info: 0
        },

        // Maximum penalty allowed for each severity.
        // This prevents repeated findings from destroying
        // the score unfairly.
        severityCaps: {
            critical: 50,
            high: 35,
            warning: 35,
            low: 15,
            info: 0
        },

        // Keep the score within 0–100.
        minimumScore: 0,
        maximumScore: 100
    };

    // --------------------------------------------------
    // GENERAL HELPERS
    // --------------------------------------------------

    function toNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function getFindings(scanResult) {
        if (!scanResult || typeof scanResult !== "object") {
            return [];
        }

        return Array.isArray(scanResult.findings)
            ? scanResult.findings
            : [];
    }

    function normalizeSeverity(finding) {
        const severity = String(
            finding && (
                finding.severity ||
                finding.level ||
                finding.priority
            ) || "info"
        ).toLowerCase();

        if (severity === "critical") {
            return "critical";
        }

        if (severity === "high" || severity === "error") {
            return "high";
        }

        if (severity === "warning" || severity === "medium") {
            return "warning";
        }

        if (severity === "low") {
            return "low";
        }

        return "info";
    }

    function normalizeCategory(finding) {
        return String(
            finding && (
                finding.category ||
                finding.type ||
                finding.group
            ) || "General"
        );
    }

    function normalizeFinding(finding, index) {
        finding = finding && typeof finding === "object"
            ? finding
            : {};

        return {
            id: finding.id || `F-${index + 1}`,
            title: finding.title || finding.name || "Untitled finding",
            severity: normalizeSeverity(finding),
            category: normalizeCategory(finding),
            description: finding.description || finding.details || "",
            recommendation:
                finding.recommendation ||
                finding.suggestion ||
                finding.fix ||
                "",
            file: finding.file || finding.filePath || finding.path || "",
            line: finding.line || null
        };
    }

    // --------------------------------------------------
    // SEVERITY SUMMARY
    // --------------------------------------------------

    function countSeverities(findings) {
        const counts = {
            critical: 0,
            high: 0,
            warning: 0,
            low: 0,
            info: 0,
            total: findings.length
        };

        findings.forEach(finding => {
            counts[finding.severity]++;
        });

        return counts;
    }

    // --------------------------------------------------
    // HEALTH SCORE
    // --------------------------------------------------

    function calculateSeverityPenalty(findings, severity) {
        const penalty = CONFIG.severityPenalties[severity] || 0;
        const cap = CONFIG.severityCaps[severity] || 0;

        const count = findings.filter(
            finding => finding.severity === severity
        ).length;

        return Math.min(count * penalty, cap);
    }

    function calculateHealthScore(findings) {
        const severityOrder = [
            "critical",
            "high",
            "warning",
            "low",
            "info"
        ];

        const penalties = {};
        let totalPenalty = 0;

        severityOrder.forEach(severity => {
            const penalty = calculateSeverityPenalty(
                findings,
                severity
            );

            penalties[severity] = penalty;
            totalPenalty += penalty;
        });

        const score = clamp(
            CONFIG.startingScore - totalPenalty,
            CONFIG.minimumScore,
            CONFIG.maximumScore
        );

        return {
            score,
            penalties,
            totalPenalty: Math.min(
                CONFIG.maximumScore,
                totalPenalty
            )
        };
    }

    function getHealthLabel(score) {
        if (score >= 90) {
            return {
                label: "Excellent",
                description: "Your repository looks well prepared for publishing.",
                status: "excellent"
            };
        }

        if (score >= 75) {
            return {
                label: "Good",
                description: "Your repository is in good shape, with a few improvements recommended.",
                status: "good"
            };
        }

        if (score >= 50) {
            return {
                label: "Needs Improvement",
                description: "Several issues should be addressed before publishing.",
                status: "needs-improvement"
            };
        }

        if (score >= 25) {
            return {
                label: "Poor",
                description: "Important repository issues need attention.",
                status: "poor"
            };
        }

        return {
            label: "Critical",
            description: "Resolve major issues before relying on this repository.",
            status: "critical"
        };
    }

    // --------------------------------------------------
    // CATEGORY BREAKDOWN
    // --------------------------------------------------

    function calculateCategoryBreakdown(findings) {
        const categories = {};

        findings.forEach(finding => {
            const category = finding.category;

            if (!categories[category]) {
                categories[category] = {
                    name: category,
                    total: 0,
                    critical: 0,
                    high: 0,
                    warning: 0,
                    low: 0,
                    info: 0
                };
            }

            categories[category].total++;
            categories[category][finding.severity]++;
        });

        return Object.values(categories).sort((a, b) => {
            const aRisk =
                a.critical * 5 +
                a.high * 4 +
                a.warning * 3 +
                a.low * 2;

            const bRisk =
                b.critical * 5 +
                b.high * 4 +
                b.warning * 3 +
                b.low * 2;

            return bRisk - aRisk || b.total - a.total;
        });
    }

    // --------------------------------------------------
    // CHECKS AND READINESS
    // --------------------------------------------------

    function calculatePassedChecks(scanResult, findings) {
        const checks = scanResult.checks || {};

        const structuralChecks = [
            {
                key: "readme",
                findingId: "DOC-001"
            },
            {
                key: "license",
                findingId: "LEGAL-001"
            },
            {
                key: "gitIgnore",
                findingId: "GIT-001"
            },
            {
                key: "tests",
                findingId: "TEST-001"
            },
            {
                key: "sourceDirectory",
                findingId: "STR-001"
            },
            {
                key: "ciConfiguration",
                findingId: "CI-001"
            },
            {
                key: "dependencyManifest",
                findingId: "CFG-001"
            },
            {
                key: "lockFile",
                findingId: "CFG-002"
            },
            {
                key: "environmentTemplate",
                findingId: "SEC-003"
            }
        ];

        let passed = 0;
        let evaluated = 0;

        structuralChecks.forEach(check => {
            const hasExplicitValue =
                Object.prototype.hasOwnProperty.call(
                    checks,
                    check.key
                );

            const matchingFinding = findings.some(
                finding => finding.id === check.findingId
            );

            // Prefer explicit scanner results when available.
            if (hasExplicitValue) {
                evaluated++;

                if (checks[check.key] === true) {
                    passed++;
                }

                return;
            }

            // Fall back to findings when the scanner did not
            // supply an explicit check result.
            if (matchingFinding) {
                evaluated++;
            }
        });

        // If the scanner did not provide structured check data,
        // use a conservative fallback rather than claiming that
        // every check passed.
        if (evaluated === 0) {
            const criticalAndHigh = findings.filter(
                finding =>
                    finding.severity === "critical" ||
                    finding.severity === "high"
            ).length;

            return {
                passed: Math.max(0, findings.length === 0 ? 1 : 0),
                total: 1,
                percentage: criticalAndHigh === 0
                    ? 100
                    : 0,
                method: "fallback"
            };
        }

        return {
            passed,
            total: evaluated,
            percentage: Math.round((passed / evaluated) * 100),
            method: "scanner-checks"
        };
    }

    function calculateReadiness(scanResult, counts, score) {
        const checks = scanResult.checks || {};

        const securityIssues =
            counts.critical + counts.high;

        const blockers = [];

        if (securityIssues > 0) {
            blockers.push(
                "Investigate critical or high-severity security findings."
            );
        }

        if (checks.readme === false) {
            blockers.push(
                "Add project documentation before publishing."
            );
        }

        if (checks.gitIgnore === false) {
            blockers.push(
                "Review ignored files and local configuration."
            );
        }

        let label;

        if (securityIssues > 0 || score < 25) {
            label = "High Risk";
        } else if (score < 50 || counts.warning >= 5) {
            label = "Needs Attention";
        } else if (score < 75) {
            label = "Almost Ready";
        } else {
            label = "Generally Ready";
        }

        return {
            label,
            blockers,
            blockerCount: blockers.length,
            securityIssues,
            score,
            note:
                "This is an automated heuristic, not a guarantee that the repository is safe or production-ready."
        };
    }

    // --------------------------------------------------
    // RECOMMENDATIONS
    // --------------------------------------------------

    function priorityForSeverity(severity) {
        const priorities = {
            critical: 1,
            high: 2,
            warning: 3,
            low: 4,
            info: 5
        };

        return priorities[severity] || 5;
    }

    function generateRecommendations(findings) {
        const seen = new Set();

        return findings
            .filter(finding => finding.recommendation)
            .sort((a, b) => {
                return (
                    priorityForSeverity(a.severity) -
                    priorityForSeverity(b.severity)
                );
            })
            .filter(finding => {
                const key = String(finding.recommendation)
                    .trim()
                    .toLowerCase();

                if (seen.has(key)) {
                    return false;
                }

                seen.add(key);
                return true;
            })
            .map((finding, index) => ({
                id: `REC-${String(index + 1).padStart(3, "0")}`,
                title: finding.title,
                description: finding.recommendation,
                severity: finding.severity,
                category: finding.category,
                file: finding.file,
                sourceFindingId: finding.id,
                priority: priorityForSeverity(finding.severity)
            }));
    }

    // --------------------------------------------------
    // FINAL REPORT
    // --------------------------------------------------

    RepoScoring.calculate = function (scanResult) {
        if (!scanResult || typeof scanResult !== "object") {
            throw new TypeError(
                "RepoScoring.calculate requires a valid scan result."
            );
        }

        const findings = getFindings(scanResult)
            .map((finding, index) =>
                normalizeFinding(finding, index)
            );

        const severityCounts = countSeverities(findings);
        const health = calculateHealthScore(findings);
        const healthStatus = getHealthLabel(health.score);
        const passedChecks = calculatePassedChecks(
            scanResult,
            findings
        );

        const categories = calculateCategoryBreakdown(findings);
        const recommendations = generateRecommendations(findings);

        const readiness = calculateReadiness(
            scanResult,
            severityCounts,
            health.score
        );

        const totalSize = toNumber(scanResult.totalSize, 0);
        const fileCount = toNumber(scanResult.fileCount, 0);

        return {
            repositoryName:
                scanResult.repositoryName || "Repository",

            repositoryType:
                scanResult.repositoryType || "Unknown",

            scannedAt:
                scanResult.scannedAt || new Date().toISOString(),

            healthScore: health.score,
            score: health.score,

            healthLabel: healthStatus.label,
            healthDescription: healthStatus.description,
            healthStatus: healthStatus.status,

            passedChecks: passedChecks.passed,
            totalChecks: passedChecks.total,
            passedPercentage: passedChecks.percentage,

            warningCount: severityCounts.warning,
            criticalCount: severityCounts.critical,
            highCount: severityCounts.high,
            lowCount: severityCounts.low,
            informationalCount: severityCounts.info,
            totalFindings: severityCounts.total,

            severityCounts,

            penalties: health.penalties,
            totalPenalty: health.totalPenalty,

            categoryBreakdown: categories,

            readiness,

            recommendations,

            metrics: {
                fileCount,
                totalSize,
                totalSizeFormatted:
                    scanResult.totalSizeFormatted || `${totalSize} bytes`,
                healthScore: health.score,
                passedChecks: passedChecks.passed,
                totalChecks: passedChecks.total
            },

            documentationStatus:
                scanResult.documentationStatus || "Unknown",

            configurationStatus:
                scanResult.configurationStatus || "Unknown",

            checks: scanResult.checks || {},

            // Preserve original findings for reports and UI.
            findings
        };
    };

    // Optional helpers for other modules.
    RepoScoring.getHealthLabel = getHealthLabel;
    RepoScoring.calculateHealthScore = calculateHealthScore;
    RepoScoring.generateRecommendations = generateRecommendations;

    window.RepoScoring = RepoScoring;
})();
