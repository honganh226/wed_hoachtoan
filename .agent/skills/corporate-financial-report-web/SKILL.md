---
name: corporate-financial-report-web
description: Build professional corporate financial reports, monthly and annual P&L dashboards, cash flow and AR/AP aging trackers, and unit economics web portals from accounting or operational Excel/CSV data. Use when the user asks to create a financial report, monthly/annual P&L statement, CFO executive dashboard, or financial reporting web page for a business website.
---

# Corporate Financial Report Web Skill (IFRS/VAS & Big 4 FP&A Standard)

## Overview
This skill guides the creation of a corporate-grade Financial Reporting & CFO Dashboard module supporting:
- **Multi-step Income Statement (P&L)** (`MS.01` to `MS.75`) across **Individual Months (`T1`–`T12`)**, **Quarters (`Q1`–`Q4`)**, and **Full Fiscal Year (`Cả Năm`)**.
- **Dual-Basis Reconciliation**: Respects both internal executive rules (`Cước gốc chưa VAT`, `+8% VAT`, `-17% nội bộ`, `Cước sau trừ 17%`) and standard accounting (`Cước gốc chưa VAT`), clearly noting `"Chưa trừ lương"` and separating `Tiền phơi trả hộ chủ hàng`.
- **Unit Economics per Truck/Trip**: Full breakdown of core fleet (`15H00266`, `15H04255`, `15H01492`, `15C35981`, `15C22405`, `15H02477`, etc.) vs. subcontractor dispatch (`Xe thuê ngoài`).
- **Working Capital & AR/AP Tracker**: Customer collection rates, AR outstanding, subcontractor AP, and EIR advance tracking.
- **Visual Print & PDF Export**: Instant A4 printing for any selected single month (`Tháng 01`–`Tháng 12`), quarter, or full fiscal year.

## 3-Step Workflow
1. **Step 1 — Data Normalization & Reconciliation**: Group operational trips by accounting month (`2026-01`..`2026-12`), quarter (`Q1`..`Q4`), and fiscal year (`2026`), separating core fleet vs. subcontractors.
2. **Step 2 — CFO Dashboard UI Rendering**: Render 4 Executive Scorecards, 2 Interactive Financial Charts (Combo Revenue/Cost/Profit + Margin % Line, Stacked Cash Collected vs. AR Bar), and 4 Deep-Dive Tabs.
3. **Step 3 — Deterministic Accounting Verification**: Verify that `Gross Profit = Revenue - COGS`, `Net Provisional Margin = Gross Profit - OPEX`, and `Sum(T1..T12) === Annual Total`.
