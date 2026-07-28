import { canonicalJson } from "./serialize.js";
import { SearchAnalyticsDimension } from "./domain.js";

export interface DateRange {
  start: string;
  end: string;
}

export interface AnalyticsDateRanges {
  current: DateRange;
  previous: DateRange;
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface AnalyticsMetricSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface AnalyticsBreakdown extends AnalyticsMetricSummary {
  key: string;
}

export interface AnalyticsSummary extends AnalyticsMetricSummary {
  rows_received: number;
  rows_deduplicated: number;
  top_queries: AnalyticsBreakdown[];
  top_pages: AnalyticsBreakdown[];
  ctr_breakdown: {
    device: AnalyticsBreakdown[];
    country: AnalyticsBreakdown[];
  };
}

export interface PeriodComparison {
  current: AnalyticsMetricSummary;
  previous: AnalyticsMetricSummary;
  delta: AnalyticsMetricSummary;
  change_pct: {
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    position: number | null;
  };
}

export const GSC_ANALYTICS_DIMENSIONS: SearchAnalyticsDimension[] = ["query", "page", "country", "device"];

function dateOnly(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new Error("invalid date");
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function calculateDateRanges(now = new Date(), windowDays = 28, lagDays = 3): AnalyticsDateRanges {
  if (!Number.isInteger(windowDays) || windowDays < 1) throw new Error("windowDays must be a positive integer");
  if (!Number.isInteger(lagDays) || lagDays < 0) throw new Error("lagDays must be a non-negative integer");
  const currentEnd = addDays(now, -lagDays);
  const currentStart = addDays(currentEnd, -(windowDays - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(windowDays - 1));
  return {
    current: { start: dateOnly(currentStart), end: dateOnly(currentEnd) },
    previous: { start: dateOnly(previousStart), end: dateOnly(previousEnd) },
  };
}

function finiteMetric(value: unknown, name: string): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`invalid GSC ${name}`);
  return value;
}

function parseRow(value: unknown): SearchAnalyticsRow {
  if (typeof value !== "object" || value === null || !("keys" in value) || !Array.isArray(value.keys) || value.keys.length !== 4 || value.keys.some((key) => typeof key !== "string")) {
    throw new Error("invalid GSC row dimensions");
  }
  const row = value as Record<string, unknown>;
  return {
    keys: value.keys as string[],
    clicks: finiteMetric(row.clicks, "clicks"),
    impressions: finiteMetric(row.impressions, "impressions"),
    ctr: finiteMetric(row.ctr, "ctr"),
    position: finiteMetric(row.position, "position"),
  };
}

export function parseSearchAnalyticsResponse(rawText: string): SearchAnalyticsRow[] {
  const parsed: unknown = JSON.parse(rawText);
  if (typeof parsed !== "object" || parsed === null) throw new Error("invalid GSC response");
  if (!("rows" in parsed) || parsed.rows === undefined) return [];
  if (!Array.isArray(parsed.rows)) throw new Error("invalid GSC rows");
  return parsed.rows.map(parseRow);
}

function metricSummary(clicks: number, impressions: number, positionWeighted: number): AnalyticsMetricSummary {
  return {
    clicks,
    impressions,
    ctr: impressions === 0 ? 0 : clicks / impressions,
    position: impressions === 0 ? 0 : positionWeighted / impressions,
  };
}

function sortBreakdown(items: AnalyticsBreakdown[]): AnalyticsBreakdown[] {
  return items.sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions || left.key.localeCompare(right.key));
}

function aggregateBy(rows: SearchAnalyticsRow[], index: number): AnalyticsBreakdown[] {
  const groups = new Map<string, { clicks: number; impressions: number; positionWeighted: number }>();
  for (const row of rows) {
    const key = row.keys[index] ?? "";
    const group = groups.get(key) ?? { clicks: 0, impressions: 0, positionWeighted: 0 };
    group.clicks += row.clicks;
    group.impressions += row.impressions;
    group.positionWeighted += row.position * row.impressions;
    groups.set(key, group);
  }
  return sortBreakdown([...groups.entries()].map(([key, group]) => ({ key, ...metricSummary(group.clicks, group.impressions, group.positionWeighted) })));
}

export function aggregateSearchAnalytics(inputRows: SearchAnalyticsRow[], topLimit = 20): AnalyticsSummary {
  const uniqueRows: SearchAnalyticsRow[] = [];
  const seen = new Set<string>();
  for (const row of inputRows) {
    const fingerprint = canonicalJson(row);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      uniqueRows.push(row);
    }
  }
  const clicks = uniqueRows.reduce((total, row) => total + row.clicks, 0);
  const impressions = uniqueRows.reduce((total, row) => total + row.impressions, 0);
  const positionWeighted = uniqueRows.reduce((total, row) => total + row.position * row.impressions, 0);
  return {
    rows_received: inputRows.length,
    rows_deduplicated: uniqueRows.length,
    ...metricSummary(clicks, impressions, positionWeighted),
    top_queries: aggregateBy(uniqueRows, 0).slice(0, topLimit),
    top_pages: aggregateBy(uniqueRows, 1).slice(0, topLimit),
    ctr_breakdown: { country: aggregateBy(uniqueRows, 2), device: aggregateBy(uniqueRows, 3) },
  };
}

function percentageChange(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}

export function comparePeriods(current: AnalyticsSummary, previous: AnalyticsSummary): PeriodComparison {
  return {
    current,
    previous,
    delta: {
      clicks: current.clicks - previous.clicks,
      impressions: current.impressions - previous.impressions,
      ctr: current.ctr - previous.ctr,
      position: current.position - previous.position,
    },
    change_pct: {
      clicks: percentageChange(current.clicks, previous.clicks),
      impressions: percentageChange(current.impressions, previous.impressions),
      ctr: percentageChange(current.ctr, previous.ctr),
      position: percentageChange(current.position, previous.position),
    },
  };
}
