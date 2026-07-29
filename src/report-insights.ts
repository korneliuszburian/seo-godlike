export type ReportInsightKind = "low_ctr" | "striking_distance" | "ahrefs_opportunity";

export interface ReportInsight {
  kind: ReportInsightKind;
  client_id: string;
  key: string;
  evidence: string;
  severity: "info" | "attention";
}

type ReportInput = { client_id: string; provider: string; analytics: Record<string, unknown> };

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function composeReportInsights(reports: ReportInput[]): ReportInsight[] {
  const insights: ReportInsight[] = [];
  for (const report of reports) {
    const current = (report.analytics.current ?? {}) as Record<string, unknown>;
    if (report.provider === "google-search-console") {
      for (const row of rows(current.top_queries)) {
        const key = typeof row.key === "string" ? row.key.trim() : "";
        const impressions = numberValue(row.impressions);
        const ctr = numberValue(row.ctr);
        if (key && impressions !== null && ctr !== null && impressions >= 100 && ctr < 0.03) {
          insights.push({ kind: "low_ctr", client_id: report.client_id, key, evidence: `${impressions} impressions; CTR ${(ctr * 100).toFixed(2)}%`, severity: "attention" });
        }
        const position = numberValue(row.position);
        if (key && impressions !== null && position !== null && impressions >= 20 && position >= 4 && position <= 20) {
          insights.push({ kind: "striking_distance", client_id: report.client_id, key, evidence: `position ${position.toFixed(2)}; ${impressions} impressions`, severity: "info" });
        }
      }
    }
    if (report.provider === "ahrefs") {
      for (const row of rows(current.organic_keyword_rows)) {
        const key = typeof row.keyword === "string" ? row.keyword.trim() : "";
        const position = numberValue(row.best_position);
        const traffic = numberValue(row.sum_traffic);
        if (key && position !== null && traffic !== null && position >= 4 && position <= 20 && traffic > 0) {
          insights.push({ kind: "ahrefs_opportunity", client_id: report.client_id, key, evidence: `position ${position.toFixed(2)}; estimated traffic ${traffic}`, severity: "info" });
        }
      }
    }
  }
  return insights.sort((a, b) => a.client_id.localeCompare(b.client_id) || a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
}
