
"use strict";

/*
=========================================================
 REPOLENS — APPLICATION CONTROLLER
 File: js/app.js
 Version: 1.0.0

 Connects:
 - index.html
 - css/style.css
 - js/scanner.js
 - js/scoring.js
 - js/reports.js

 No backend required.
=========================================================
*/

document.addEventListener("DOMContentLoaded", () => {
    const $ = (selector) => document.querySelector(selector);

    const elements = {
        sidebar: $("#sidebar"),
        menuToggle: $("#menuToggle"),

        dropZone: $("#dropZone"),
        fileInput: $("#fileInput"),
        folderInput: $("#folderInput"),
        browseZipButton: $("#browseZipButton"),
        browseFolderButton: $("#browseFolderButton"),
        emptyStateScanButton: $("#emptyStateScanButton"),
        newScanButton: $("#newScanButton"),
        rescanButton: $("#rescanButton"),
        runScanButton: $("#runScanButton"),
        clearButton: $("#clearButton"),

        selectedProject: $("#selectedProject"),
        selectedProjectName: $("#selectedProjectName"),
        selectedProjectMeta: $("#selectedProjectMeta"),

        scanProgress: $("#scanProgress"),
        progressLabel: $("#progressLabel"),
        progressPercentage: $("#progressPercentage"),
        progressFill: $("#progressFill"),
        progressBar: $("#progressBar"),

        messageArea: $("#messageArea"),

        healthScore: $("#healthScore"),
        healthProgress: $("#healthProgress"),
        healthLabel: $("#healthLabel"),

        passedChecks: $("#passedChecks"),
        passedDescription: $("#passedDescription"),
        warningCount: $("#warningCount"),
        warningDescription: $("#warningDescription"),
        criticalCount: $("#criticalCount"),
        criticalDescription: $("#criticalDescription"),

        findingNavCount: $("#findingNavCount"),
        findingsSubtitle: $("#findingsSubtitle"),
        findingsCount: $("#findingsCount"),
        findingsList: $("#findingsList"),
        emptyFindings: $("#emptyFindings"),
        resultsFooter: $("#resultsFooter"),

        findingSearch: $("#findingSearch"),
        severityFilter: $("#severityFilter"),
        categoryFilter: $("#categoryFilter"),
        clearFiltersButton: $("#clearFiltersButton"),
        exportFindingsButton: $("#exportFindingsButton"),

        repositoryName: $("#repositoryName"),
        repositoryType: $("#repositoryType"),
        fileCount: $("#fileCount"),
        projectSize: $("#projectSize"),
        documentationStatus: $("#documentationStatus"),
        configurationStatus: $("#configurationStatus"),
        lastAudited: $("#lastAudited"),

        recommendationList: $("#recommendationList"),

        exportJsonButton: $("#exportJsonButton"),
        exportCsvButton: $("#exportCsvButton"),

        helpButton: $("#helpButton"),
        helpDialog: $("#helpDialog"),
        closeHelpButton: $("#closeHelpButton"),
        gotItButton: $("#gotItButton"),

        toastContainer: $("#toastContainer"),
        breadcrumbCurrent: $("#breadcrumbCurrent")
    };

    const MAX_ARCHIVE_SIZE = 25 * 1024 * 1024;
    const MAX_FILES = 5000;

    let selectedFiles = [];
    let selectedProjectName = "";
    let lastAudit = null;
    let auditInProgress = false;
    let auditToken = 0;
    let toastCounter = 0;

    /*
    =====================================================
     GENERAL HELPERS
    =====================================================
    */

    function setText(element, value) {
        if (element) {
            element.textContent = String(value);
        }
    }

    function setVisible(element, visible) {
        if (element) {
            element.hidden = !visible;
        }
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) {
            return "Unknown";
        }

        if (bytes < 1024) {
            return `${bytes} B`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatDate(date = new Date()) {
        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function safeErrorMessage(error) {
        if (error instanceof Error && error.message) {
            return error.message;
        }

        return "An unexpected error occurred. Please try again.";
    }

    function showMessage(message, type = "info") {
        const area = elements.messageArea;

        if (!area) {
            showToast(message, type);
            return;
        }

        area.textContent = message;
        area.className = "message-area";

        if (type === "error") {
            area.classList.add("error");
        } else if (type === "success") {
            area.classList.add("success");
        }

        setVisible(area, true);
    }

    function clearMessage() {
        if (!elements.messageArea) {
            return;
        }

        elements.messageArea.textContent = "";
        elements.messageArea.className = "message-area";
        setVisible(elements.messageArea, false);
    }

    function showToast(message, type = "info") {
        if (!elements.toastContainer) {
            console.log(`[RepoLens] ${message}`);
            return;
        }

        const toast = document.createElement("div");

        toast.className = `toast ${type}`;
        toast.setAttribute("role", "status");
        toast.textContent = message;

        elements.toastContainer.appendChild(toast);

        const id = ++toastCounter;

        window.setTimeout(() => {
            if (toast.isConnected) {
                toast.remove();
            }
        }, 4500);

        return id;
    }

    function setButtonBusy(button, busy, busyText = "Working...") {
        if (!button) {
            return;
        }

        if (busy) {
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.textContent.trim();
            }

            button.disabled = true;
            button.classList.add("is-loading");
            button.setAttribute("aria-busy", "true");
            button.dataset.busyText = busyText;
        } else {
            button.disabled = false;
            button.classList.remove("is-loading");
            button.removeAttribute("aria-busy");

            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
                delete button.dataset.originalText;
            }

            delete button.dataset.busyText;
        }
    }

    function setProgress(percent, label) {
        const safePercent = Math.max(0, Math.min(100, percent));

        setText(elements.progressLabel, label);
        setText(elements.progressPercentage, `${Math.round(safePercent)}%`);
        setText(elements.progressBar, "");

        if (elements.progressFill) {
            elements.progressFill.style.width = `${safePercent}%`;
        }

        if (elements.progressBar) {
            elements.progressBar.setAttribute(
                "aria-valuenow",
                String(Math.round(safePercent))
            );
        }
    }

    function updateProgress(percent, label) {
        setVisible(elements.scanProgress, true);
        setProgress(percent, label);
    }

    /*
    =====================================================
     FILE VALIDATION
    =====================================================
    */

    function validateFiles(files) {
        if (!Array.isArray(files) || files.length === 0) {
            throw new Error("No files were selected.");
        }

        if (files.length > MAX_FILES) {
            throw new Error(
                `This project contains ${files.length} files. ` +
                `The current limit is ${MAX_FILES}.`
            );
        }

        const totalSize = files.reduce((sum, file) => {
            return sum + (Number(file.size) || 0);
        }, 0);

        if (totalSize > MAX_ARCHIVE_SIZE) {
            throw new Error(
                `The selected project is ${formatBytes(totalSize)}. ` +
                `The maximum supported size is 25 MB.`
            );
        }

        for (const file of files) {
            if (!file || typeof file.name !== "string") {
                throw new Error("One or more selected files are invalid.");
            }
        }

        return {
            count: files.length,
            totalSize
        };
    }

    function getFileName(file) {
        return file.webkitRelativePath || file.name || "Unnamed file";
    }

    function getRootName(files, fallback) {
        const firstPath = files
            .map(getFileName)
            .find(path => path.includes("/"));

        if (firstPath) {
            return firstPath.split("/")[0];
        }

        return fallback || "Uploaded repository";
    }

    /*
    =====================================================
     FILE SELECTION
    =====================================================
    */

    function prepareSelectedFiles(files, name, source) {
        try {
            if (auditInProgress) {
                showToast(
                    "Please wait for the current audit to finish.",
                    "info"
                );
                return;
            }

            const fileArray = Array.from(files || []);

            validateFiles(fileArray);

            const isZip = source === "zip";

            if (isZip) {
                if (fileArray.length !== 1) {
                    throw new Error("Please select one ZIP archive.");
                }

                const file = fileArray[0];

                if (
                    !file.name.toLowerCase().endsWith(".zip") &&
                    file.type !== "application/zip" &&
                    file.type !== "application/x-zip-compressed"
                ) {
                    throw new Error(
                        "That file does not appear to be a ZIP archive."
                    );
                }

                if (file.size > MAX_ARCHIVE_SIZE) {
                    throw new Error(
                        "The ZIP archive exceeds the 25 MB limit."
                    );
                }
            }

            selectedFiles = fileArray;
            selectedProjectName = name || getRootName(fileArray, "Repository");

            setText(elements.selectedProjectName, selectedProjectName);

            const details = isZip
                ? `${fileArray.length} archive · ${formatBytes(fileArray[0].size)}`
                : `${fileArray.length} selected files · ${formatBytes(
                    fileArray.reduce(
                        (total, file) => total + (file.size || 0),
                        0
                    )
                )
                }`;

            setText(elements.selectedProjectMeta, details);

            setVisible(elements.selectedProject, true);
            setVisible(elements.scanProgress, false);

            clearMessage();

            if (elements.runScanButton) {
                elements.runScanButton.disabled = false;
            }

            showMessage(
                "Repository selected. Run the audit when you are ready.",
                "success"
            );

            if (elements.fileInput) {
                elements.fileInput.value = "";
            }

            if (elements.folderInput) {
                elements.folderInput.value = "";
            }

        } catch (error) {
            showMessage(safeErrorMessage(error), "error");
        }
    }

    function chooseZip() {
        if (auditInProgress) {
            showToast("An audit is already running.", "info");
            return;
        }

        elements.fileInput?.click();
    }

    function chooseFolder() {
        if (auditInProgress) {
            showToast("An audit is already running.", "info");
            return;
        }

        elements.folderInput?.click();
    }

    /*
    =====================================================
     SCANNER INTEGRATION
    =====================================================
    */

    async function scanRepository(files, name, source, token) {
        if (
            typeof window.RepoScanner === "undefined" ||
            typeof window.RepoScanner.scan !== "function"
        ) {
            throw new Error(
                "The scanner is not loaded. Check js/scanner.js and " +
                "make sure it defines window.RepoScanner.scan()."
            );
        }

        const result = await window.RepoScanner.scan({
            files,
            name,
            source,
            onProgress: (percent, label) => {
                if (token !== auditToken) {
                    return;
                }

                updateProgress(percent, label);
            }
        });

        if (!result || typeof result !== "object") {
            throw new Error("The scanner returned an invalid result.");
        }

        return result;
    }

    function calculateScore(scanResult) {
        if (
            typeof window.RepoScoring === "undefined" ||
            typeof window.RepoScoring.calculate !== "function"
        ) {
            throw new Error(
                "The scoring engine is not loaded. Check js/scoring.js " +
                "and make sure it defines window.RepoScoring.calculate()."
            );
        }

        return window.RepoScoring.calculate(scanResult);
    }

    /*
    =====================================================
     START AUDIT
    =====================================================
    */

    async function runAudit() {
        if (auditInProgress) {
            return;
        }

        if (!selectedFiles.length) {
            showMessage("Choose a project folder or ZIP archive first.", "error");
            return;
        }

        try {
            validateFiles(selectedFiles);
        } catch (error) {
            showMessage(safeErrorMessage(error), "error");
            return;
        }

        auditInProgress = true;
        const token = ++auditToken;

        clearMessage();
        setVisible(elements.scanProgress, true);

        setButtonBusy(elements.runScanButton, true, "Scanning...");
        setButtonBusy(elements.browseZipButton, true);
        setButtonBusy(elements.browseFolderButton, true);
        setButtonBusy(elements.newScanButton, true);
        setButtonBusy(elements.rescanButton, true);

        if (elements.runScanButton) {
            elements.runScanButton.textContent = "Scanning...";
        }

        updateProgress(3, "Preparing repository...");

        try {
            const source = selectedFiles.length === 1 &&
                selectedFiles[0].name.toLowerCase().endsWith(".zip")
                ? "zip"
                : "folder";

            const scanResult = await scanRepository(
                selectedFiles,
                selectedProjectName,
                source,
                token
            );

            if (token !== auditToken) {
                return;
            }

            updateProgress(85, "Calculating repository health...");

            const scoreResult = calculateScore(scanResult);

            if (token !== auditToken) {
                return;
            }

            const findings = normalizeFindings(
                scoreResult.findings ||
                scanResult.findings ||
                []
            );

            const score = normalizeScore(
                scoreResult.score ??
                scoreResult.healthScore ??
                0
            );

            lastAudit = {
                name: selectedProjectName,
                source,
                scanResult,
                score,
                findings,
                passed: findings.filter(f => f.severity === "passed").length,
                warnings: findings.filter(f => f.severity === "warning").length,
                critical: findings.filter(f => f.severity === "critical").length,
                info: findings.filter(f => f.severity === "info").length,
                fileCount: Number(scanResult.fileCount) ||
                    selectedFiles.length,
                totalSize: Number(scanResult.totalSize) ||
                    selectedFiles.reduce(
                        (sum, file) => sum + (file.size || 0),
                        0
                    ),
                timestamp: new Date().toISOString()
            };

            renderDashboard(lastAudit);

            updateProgress(100, "Audit completed successfully.");

            setTimeout(() => {
                if (token === auditToken) {
                    setVisible(elements.scanProgress, false);
                }
            }, 900);

            showMessage(
                `Audit complete. Repository health: ${score}/100.`,
                "success"
            );

            showToast("Repository audit completed.", "success");

            const resultsSection = document.getElementById("findings");

            if (resultsSection) {
                resultsSection.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }

        } catch (error) {
            console.error("[RepoLens] Audit failed:", error);

            if (token === auditToken) {
                setVisible(elements.scanProgress, false);

                showMessage(
                    `Audit failed: ${safeErrorMessage(error)}`,
                    "error"
                );

                showToast("The audit could not be completed.", "error");
            }

        } finally {
            if (token === auditToken) {
                auditInProgress = false;

                setButtonBusy(elements.runScanButton, false);
                setButtonBusy(elements.browseZipButton, false);
                setButtonBusy(elements.browseFolderButton, false);
                setButtonBusy(elements.newScanButton, false);
                setButtonBusy(elements.rescanButton, false);

                if (elements.runScanButton) {
                    elements.runScanButton.textContent = "Run audit";
                    elements.runScanButton.disabled = !selectedFiles.length;
                }
            }
        }
    }

    /*
    =====================================================
     FINDING NORMALIZATION
    =====================================================
    */

    function normalizeScore(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return 0;
        }

        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function normalizeFindings(findings) {
        if (!Array.isArray(findings)) {
            return [];
        }

        const allowedSeverities = [
            "critical",
            "warning",
            "passed",
            "info"
        ];

        const allowedCategories = [
            "documentation",
            "configuration",
            "structure",
            "security",
            "publishing"
        ];

        return findings.map((finding, index) => {
            const severity = String(
                finding.severity || finding.status || "info"
            ).toLowerCase();

            const category = String(
                finding.category || "structure"
            ).toLowerCase();

            return {
                id: String(finding.id || `finding-${index + 1}`),
                title: String(
                    finding.title ||
                    finding.name ||
                    "Untitled finding"
                ),
                description: String(
                    finding.description ||
                    finding.message ||
                    "No additional details were provided."
                ),
                recommendation: String(
                    finding.recommendation ||
                    finding.fix ||
                    ""
                ),
                severity: allowedSeverities.includes(severity)
                    ? severity
                    : "info",
                category: allowedCategories.includes(category)
                    ? category
                    : "structure"
            };
        });
    }

    /*
    =====================================================
     DASHBOARD RENDERING
    =====================================================
    */

    function renderDashboard(audit) {
        setText(elements.healthScore, audit.score);
        setText(elements.healthLabel, getHealthLabel(audit.score));

        if (elements.healthProgress) {
            elements.healthProgress.style.width = `${audit.score}%`;
        }

        setText(elements.passedChecks, audit.passed);
        setText(
            elements.passedDescription,
            `${audit.passed} checks passed`
        );

        setText(elements.warningCount, audit.warnings);
        setText(
            elements.warningDescription,
            audit.warnings === 0
                ? "No warnings found"
                : "Review recommended"
        );

        setText(elements.criticalCount, audit.critical);
        setText(
            elements.criticalDescription,
            audit.critical === 0
                ? "No critical findings"
                : "Requires attention"
        );

        setText(elements.repositoryName, audit.name);
        setText(
            elements.repositoryType,
            audit.source === "zip"
                ? "ZIP archive"
                : "Selected project folder"
        );

        setText(elements.fileCount, audit.fileCount);
        setText(elements.projectSize, formatBytes(audit.totalSize));

        setText(
            elements.documentationStatus,
            getCategoryStatus(audit.findings, "documentation")
        );

        setText(
            elements.configurationStatus,
            getCategoryStatus(audit.findings, "configuration")
        );

        setText(elements.lastAudited, formatDate(new Date(audit.timestamp)));

        setText(
            elements.findingsSubtitle,
            `${audit.findings.length} checks and findings from this audit`
        );

        setText(elements.findingNavCount, audit.findings.length);

        const jsonButton = elements.exportJsonButton;
        const csvButton = elements.exportCsvButton;
        const findingsButton = elements.exportFindingsButton;

        if (jsonButton) jsonButton.disabled = false;
        if (csvButton) csvButton.disabled = false;
        if (findingsButton) findingsButton.disabled = false;

        renderFindings();
        renderRecommendations(audit);
    }

    function getHealthLabel(score) {
        if (score >= 90) return "Excellent repository health";
        if (score >= 75) return "Good repository health";
        if (score >= 50) return "Needs improvement";
        if (score >= 25) return "Significant issues detected";
        return "Major improvements recommended";
    }

    function getCategoryStatus(findings, category) {
        const categoryFindings = findings.filter(
            finding => finding.category === category
        );

        if (categoryFindings.length === 0) {
            return "Not assessed";
        }

        const hasCritical = categoryFindings.some(
            finding => finding.severity === "critical"
        );

        const hasWarning = categoryFindings.some(
            finding => finding.severity === "warning"
        );

        if (hasCritical) return "Needs attention";
        if (hasWarning) return "Review needed";

        const hasPassed = categoryFindings.some(
            finding => finding.severity === "passed"
        );

        return hasPassed ? "Passed" : "Assessed";
    }

    /*
    =====================================================
     FINDINGS SEARCH AND FILTER
    =====================================================
    */

    function renderFindings() {
        if (!elements.findingsList) {
            return;
        }

        const findings = lastAudit ? lastAudit.findings : [];

        const query = (
            elements.findingSearch?.value || ""
        ).trim().toLowerCase();

        const severity = elements.severityFilter?.value || "all";
        const category = elements.categoryFilter?.value || "all";

        const filtered = findings.filter(finding => {
            const searchableText = [
                finding.title,
                finding.description,
                finding.recommendation,
                finding.category
            ].join(" ").toLowerCase();

            const matchesQuery = !query ||
                searchableText.includes(query);

            const matchesSeverity = severity === "all" ||
                finding.severity === severity;

            const matchesCategory = category === "all" ||
                finding.category === category;

            return matchesQuery && matchesSeverity && matchesCategory;
        });

        const severityOrder = {
            critical: 0,
            warning: 1,
            info: 2,
            passed: 3
        };

        filtered.sort((a, b) => {
            return severityOrder[a.severity] - severityOrder[b.severity];
        });

        elements.findingsList.replaceChildren();

        setText(
            elements.findingsCount,
            `${filtered.length} finding${filtered.length === 1 ? "" : "s"}`
        );

        setText(
            elements.resultsFooter,
            lastAudit
                ? `Showing ${filtered.length} of ${findings.length} findings`
                : "No repository analyzed"
        );

        if (elements.emptyFindings) {
            elements.emptyFindings.hidden = filtered.length !== 0;
        }

        if (!lastAudit) {
            if (elements.emptyFindings) {
                elements.emptyFindings.hidden = false;

                const heading = elements.emptyFindings.querySelector("h3");
                const paragraph = elements.emptyFindings.querySelector("p");
                const button = elements.emptyFindings.querySelector("button");

                setText(heading, "No audit results yet");
                setText(
                    paragraph,
                    "Upload a repository and run an audit to discover issues."
                );
                setText(button, "Select a repository");
            }

            return;
        }

        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";

            const heading = document.createElement("h3");
            heading.textContent = "No matching findings";

            const paragraph = document.createElement("p");
            paragraph.textContent =
                "Try changing your search or filter settings.";

            empty.append(heading, paragraph);
            elements.findingsList.appendChild(empty);

            return;
        }

        for (const finding of filtered) {
            elements.findingsList.appendChild(
                createFindingElement(finding)
            );
        }
    }

    function createFindingElement(finding) {
        const article = document.createElement("article");
        article.className = "finding-item";

        const icon = document.createElement("div");
        icon.className = `finding-status-icon ${finding.severity}`;
        icon.setAttribute("aria-hidden", "true");

        const symbols = {
            critical: "!",
            warning: "!",
            passed: "✓",
            info: "i"
        };

        icon.textContent = symbols[finding.severity] || "i";

        const content = document.createElement("div");
        content.className = "finding-content";

        const titleRow = document.createElement("div");
        titleRow.className = "finding-title-row";

        const title = document.createElement("strong");
        title.className = "finding-title";
        title.textContent = finding.title;

        const severity = document.createElement("span");
        severity.className = `finding-severity ${finding.severity}`;
        severity.textContent = finding.severity;

        const category = document.createElement("span");
        category.className = "finding-category";
        category.textContent = finding.category;

        titleRow.append(title, severity, category);

        const description = document.createElement("p");
        description.className = "finding-description";
        description.textContent = finding.description;

        content.append(titleRow, description);

        if (finding.recommendation) {
            const recommendation = document.createElement("div");
            recommendation.className = "finding-recommendation";

            const label = document.createElement("strong");
            label.textContent = "Recommended action: ";

            recommendation.append(
                label,
                document.createTextNode(finding.recommendation)
            );

            content.appendChild(recommendation);
        }

        article.append(icon, content);

        return article;
    }

    function clearFilters() {
        if (elements.findingSearch) {
            elements.findingSearch.value = "";
        }

        if (elements.severityFilter) {
            elements.severityFilter.value = "all";
        }

        if (elements.categoryFilter) {
            elements.categoryFilter.value = "all";
        }

        renderFindings();
    }

    /*
    =====================================================
     RECOMMENDATIONS
    =====================================================
    */

    function renderRecommendations(audit) {
        if (!elements.recommendationList) {
            return;
        }

        const actionable = audit.findings.filter(
            finding =>
                finding.severity === "critical" ||
                finding.severity === "warning"
        );

        elements.recommendationList.replaceChildren();

        if (actionable.length === 0) {
            const item = document.createElement("div");
            item.className = "recommendation-item";

            const number = document.createElement("span");
            number.className = "recommendation-number";
            number.textContent = "✓";

            const content = document.createElement("div");

            const heading = document.createElement("strong");
            heading.textContent = "No outstanding warnings";

            const paragraph = document.createElement("p");
            paragraph.textContent =
                "No critical issues or warnings were identified by the checks performed.";

            content.append(heading, paragraph);
            item.append(number, content);
            elements.recommendationList.appendChild(item);

            return;
        }

        actionable.slice(0, 5).forEach((finding, index) => {
            const item = document.createElement("div");
            item.className = "recommendation-item";

            const number = document.createElement("span");
            number.className = "recommendation-number";
            number.textContent = String(index + 1).padStart(2, "0");

            const content = document.createElement("div");

            const heading = document.createElement("strong");
            heading.textContent = finding.title;

            const paragraph = document.createElement("p");
            paragraph.textContent =
                finding.recommendation ||
                finding.description;

            content.append(heading, paragraph);
            item.append(number, content);

            elements.recommendationList.appendChild(item);
        });
    }

    /*
    =====================================================
     REPORT EXPORT INTEGRATION
    =====================================================
    */

    function exportReport(format, findingsOnly = false) {
        if (!lastAudit) {
            showToast("Run an audit before exporting a report.", "info");
            return;
        }

        if (
            typeof window.RepoReports === "undefined"
        ) {
            showToast(
                "Report exporter is not loaded. Check js/reports.js.",
                "error"
            );
            return;
        }

        const report = findingsOnly
            ? {
                name: lastAudit.name,
                score: lastAudit.score,
                findings: lastAudit.findings,
                timestamp: lastAudit.timestamp
            }
            : lastAudit;

        try {
            let result;

            if (
                format === "json" &&
                typeof window.RepoReports.exportJSON === "function"
            ) {
                result = window.RepoReports.exportJSON(report);
            } else if (
                format === "csv" &&
                typeof window.RepoReports.exportCSV === "function"
            ) {
                result = window.RepoReports.exportCSV(report);
            } else {
                throw new Error(
                    `The ${format.toUpperCase()} export function is missing.`
                );
            }

            if (result === false) {
                throw new Error("The report could not be exported.");
            }

            showToast(
                `${format.toUpperCase()} report export requested.`,
                "success"
            );

        } catch (error) {
            console.error("[RepoLens] Export failed:", error);
            showToast(safeErrorMessage(error), "error");
        }
    }

    /*
    =====================================================
     RESET AUDIT
    =====================================================
    */

    function resetAudit() {
        if (auditInProgress) {
            showToast(
                "Wait until the current audit finishes before resetting.",
                "info"
            );
            return;
        }

        selectedFiles = [];
        selectedProjectName = "";
        lastAudit = null;

        if (elements.fileInput) elements.fileInput.value = "";
        if (elements.folderInput) elements.folderInput.value = "";

        setVisible(elements.selectedProject, false);
        setVisible(elements.scanProgress, false);

        clearMessage();
        clearFilters();

        setText(elements.healthScore, "—");
        setText(elements.healthLabel, "Run an audit to calculate health");

        if (elements.healthProgress) {
            elements.healthProgress.style.width = "0%";
        }

        setText(elements.passedChecks, "—");
        setText(elements.passedDescription, "Awaiting analysis");

        setText(elements.warningCount, "—");
        setText(elements.warningDescription, "Awaiting analysis");

        setText(elements.criticalCount, "—");
        setText(elements.criticalDescription, "Awaiting analysis");

        setText(elements.repositoryName, "No repository");
        setText(elements.repositoryType, "Waiting for upload");

        setText(elements.fileCount, "—");
        setText(elements.projectSize, "—");
        setText(elements.documentationStatus, "—");
        setText(elements.configurationStatus, "—");
        setText(elements.lastAudited, "—");

        setText(elements.findingsSubtitle, "Your repository checks will appear here.");
        setText(elements.findingNavCount, "0");

        if (elements.exportJsonButton) elements.exportJsonButton.disabled = true;
        if (elements.exportCsvButton) elements.exportCsvButton.disabled = true;
        if (elements.exportFindingsButton) elements.exportFindingsButton.disabled = true;

        elements.recommendationList?.replaceChildren();

        if (elements.emptyFindings) {
            const heading = elements.emptyFindings.querySelector("h3");
            const paragraph = elements.emptyFindings.querySelector("p");
            const button = elements.emptyFindings.querySelector("button");

            setText(heading, "No audit results yet");
            setText(
                paragraph,
                "Upload a repository and run an audit to discover issues."
            );
            setText(button, "Select a repository");

            elements.emptyFindings.hidden = false;
        }

        renderFindings();

        showToast("Audit workspace reset.", "success");
    }

    /*
    =====================================================
     HELP DIALOG
    =====================================================
    */

    function openHelp() {
        if (!elements.helpDialog) {
            showToast(
                "Select a project folder or ZIP archive to begin.",
                "info"
            );
            return;
        }

        if (typeof elements.helpDialog.showModal === "function") {
            elements.helpDialog.showModal();
        } else {
            showToast(
                "Upload a repository, run an audit and review the findings.",
                "info"
            );
        }
    }

    function closeHelp() {
        if (elements.helpDialog?.open) {
            elements.helpDialog.close();
        }
    }

    /*
    =====================================================
     MOBILE NAVIGATION
    =====================================================
    */

    function closeSidebar() {
        elements.sidebar?.classList.remove("sidebar-open");
        elements.menuToggle?.setAttribute("aria-expanded", "false");
    }

    function toggleSidebar() {
        if (!elements.sidebar) {
            return;
        }

        const isOpen = elements.sidebar.classList.toggle("sidebar-open");

        elements.menuToggle?.setAttribute(
            "aria-expanded",
            String(isOpen)
        );
    }

    function setupNavigation() {
        document.querySelectorAll(".nav-link").forEach(link => {
            link.addEventListener("click", () => {
                document.querySelectorAll(".nav-link").forEach(item => {
                    item.classList.remove("active");
                });

                link.classList.add("active");

                const target = link.getAttribute("href");
                const targetElement = target
                    ? document.querySelector(target)
                    : null;

                if (targetElement && elements.breadcrumbCurrent) {
                    const navText = link.querySelector("span:nth-child(2)");
                    setText(
                        elements.breadcrumbCurrent,
                        navText?.textContent.trim() || "Workspace"
                    );
                }

                closeSidebar();
            });
        });
    }

    /*
    =====================================================
     DRAG AND DROP
    =====================================================
    */

    function setupDragAndDrop() {
        const zone = elements.dropZone;

        if (!zone) {
            return;
        }

        ["dragenter", "dragover"].forEach(eventName => {
            zone.addEventListener(eventName, event => {
                event.preventDefault();

                if (!auditInProgress) {
                    zone.classList.add("drag-over");
                }
            });
        });

        ["dragleave", "dragend"].forEach(eventName => {
            zone.addEventListener(eventName, () => {
                zone.classList.remove("drag-over");
            });
        });

        zone.addEventListener("drop", event => {
            event.preventDefault();
            zone.classList.remove("drag-over");

            if (auditInProgress) {
                showToast("An audit is already running.", "info");
                return;
            }

            const files = Array.from(
                event.dataTransfer?.files || []
            );

            if (files.length === 1 &&
                files[0].name.toLowerCase().endsWith(".zip")) {
                prepareSelectedFiles(files, files[0].name, "zip");
                return;
            }

            if (files.length > 0) {
                prepareSelectedFiles(
                    files,
                    getRootName(files, "Dropped project"),
                    "folder"
                );
                return;
            }

            showMessage(
                "No accessible files were found in the dropped item.",
                "error"
            );
        });

        zone.addEventListener("keydown", event => {
            if (event.target !== zone) {
                return;
            }

            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                chooseZip();
            }
        });

        /*
         * The drop zone is also a button-like surface.
         * Ignore clicks on its nested controls.
         */
        zone.addEventListener("click", event => {
            if (
                event.target.closest("button") ||
                event.target.closest("input")
            ) {
                return;
            }

            chooseZip();
        });
    }

    /*
    =====================================================
     EVENT LISTENERS
    =====================================================
    */

    function bindEvents() {
        elements.browseZipButton?.addEventListener("click", chooseZip);

        elements.browseFolderButton?.addEventListener("click", chooseFolder);

        elements.emptyStateScanButton?.addEventListener("click", chooseZip);

        elements.newScanButton?.addEventListener("click", () => {
            document.getElementById("scanner")?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            chooseZip();
        });

        elements.rescanButton?.addEventListener("click", () => {
            document.getElementById("scanner")?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            chooseZip();
        });

        elements.runScanButton?.addEventListener("click", runAudit);

        elements.clearButton?.addEventListener("click", resetAudit);

        elements.fileInput?.addEventListener("change", event => {
            const files = Array.from(event.target.files || []);

            if (files.length > 0) {
                prepareSelectedFiles(files, files[0].name, "zip");
            }
        });

        elements.folderInput?.addEventListener("change", event => {
            const files = Array.from(event.target.files || []);

            if (files.length > 0) {
                prepareSelectedFiles(
                    files,
                    getRootName(files, "Project folder"),
                    "folder"
                );
            }
        });

        elements.findingSearch?.addEventListener("input", renderFindings);

        elements.severityFilter?.addEventListener("change", renderFindings);

        elements.categoryFilter?.addEventListener("change", renderFindings);

        elements.clearFiltersButton?.addEventListener("click", clearFilters);

        elements.exportJsonButton?.addEventListener("click", () => {
            exportReport("json");
        });

        elements.exportCsvButton?.addEventListener("click", () => {
            exportReport("csv");
        });

        elements.exportFindingsButton?.addEventListener("click", () => {
            exportReport("csv", true);
        });

        elements.helpButton?.addEventListener("click", openHelp);

        elements.closeHelpButton?.addEventListener("click", closeHelp);

        elements.gotItButton?.addEventListener("click", closeHelp);

        elements.helpDialog?.addEventListener("click", event => {
            if (event.target === elements.helpDialog) {
                closeHelp();
            }
        });

        elements.menuToggle?.addEventListener("click", toggleSidebar);

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                closeSidebar();
            }
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth > 700) {
                closeSidebar();
            }
        });
    }

    /*
    =====================================================
     INITIALIZATION
    =====================================================
    */

    function init() {
        bindEvents();
        setupDragAndDrop();
        setupNavigation();

        renderFindings();

        setText(elements.healthScore, "—");
        setText(elements.passedChecks, "—");
        setText(elements.warningCount, "—");
        setText(elements.criticalCount, "—");

        if (elements.runScanButton) {
            elements.runScanButton.disabled = true;
        }

        if (elements.exportJsonButton) {
            elements.exportJsonButton.disabled = true;
        }

        if (elements.exportCsvButton) {
            elements.exportCsvButton.disabled = true;
        }

        if (elements.exportFindingsButton) {
            elements.exportFindingsButton.disabled = true;
        }

        console.info(
            "%cRepoLens",
            "color:#a995ff;font-weight:bold;font-size:18px"
        );

        console.info(
            "Application initialized. Waiting for a repository."
        );
    }

    init();
});
