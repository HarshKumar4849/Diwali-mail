"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { parseCSV, parseExcel } from "@/lib/utils";
import type { WizardData } from "@/types";
import { FileSpreadsheet, UploadCloud, CheckCircle2, AlertCircle } from "lucide-react";

const isExcel = (name: string) => /\.xlsx?$/i.test(name);

export function StepSetup({
  data,
  updateData,
}: {
  data: WizardData;
  updateData: (d: Partial<WizardData>) => void;
}) {
  const [csvPreview, setCsvPreview] = useState<string[][]>(() => {
    if (data.csvHeaders && data.csvRows && data.csvRows.length > 0) {
      return [data.csvHeaders, ...data.csvRows.slice(0, 3).map((r) => data.csvHeaders!.map((h) => r[h]))];
    }
    return [];
  });
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setParsing(true);
    setParseError("");
    try {
      const parsed = isExcel(file.name)
        ? await parseExcel(file)
        : parseCSV(await file.text());

      if (!parsed.headers || parsed.headers.length === 0) {
        throw new Error("No columns detected in this file. Please verify your spreadsheet format.");
      }

      // Auto-detect email column if not already chosen
      const guessedEmailCol =
        data.emailColumn ||
        parsed.headers.find((h) => /email|mail/i.test(h)) ||
        parsed.headers[0];

      updateData({
        csvHeaders: parsed.headers,
        csvRows: parsed.rows,
        csvFileName: file.name,
        emailColumn: guessedEmailCol,
      });

      setCsvPreview([
        parsed.headers,
        ...parsed.rows.slice(0, 3).map((r) => parsed.headers.map((h) => r[h])),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse file";
      setParseError(msg);
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-6">
      {/* Campaign Name */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Campaign Name <span className="text-destructive">*</span>
        </label>
        <Input
          value={data.name || ""}
          onChange={(e) => updateData({ name: e.target.value })}
          placeholder="e.g. Q4 Client Newsletter, Product Launch"
          className="h-10 text-sm bg-background"
        />
        <p className="text-xs text-muted-foreground">
          A descriptive internal label to identify this campaign in your dashboard.
        </p>
      </div>

      {/* Upload Dropzone */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">
          Recipient List (CSV or Excel) <span className="text-destructive">*</span>
        </label>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-2xl p-6 sm:p-8 text-center cursor-pointer bg-muted/15 hover:bg-muted/30 active:scale-[0.995] transition-all duration-200 group"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform duration-200 shadow-2xs">
            <UploadCloud className="size-6" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {parsing ? "Parsing spreadsheet..." : "Click to select or drop your file here"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Supports .CSV, .XLSX, and .XLS files with column headers
          </p>

          {data.csvFileName && !parsing && (
            <div className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-lg bg-background border border-border/80 text-xs font-medium text-foreground shadow-xs">
              <FileSpreadsheet className="size-4 text-primary" />
              <span>{data.csvFileName}</span>
              <span className="text-muted-foreground tabular-nums">({data.csvRows?.length || 0} rows)</span>
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            </div>
          )}
        </div>

        {parseError && (
          <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}
      </div>

      {/* Email Column Selection & Preview */}
      {data.csvHeaders && data.csvHeaders.length > 0 && (
        <ScrollReveal variant="table" className="space-y-4 pt-2 border-t border-border/60">
          <div className="space-y-2 max-w-sm">
            <label className="block text-sm font-semibold text-foreground">
              Recipient Email Column <span className="text-destructive">*</span>
            </label>
            <select
              className="w-full h-10 px-3 rounded-lg border border-input/90 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all duration-150"
              value={data.emailColumn || ""}
              onChange={(e) => updateData({ emailColumn: e.target.value })}
            >
              <option value="">Select a column...</option>
              {data.csvHeaders.map((h: string) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Select which column in your file contains the destination email addresses.
            </p>
          </div>

          {/* Table Preview */}
          {csvPreview.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Data Sample (First 3 rows)</span>
                <span>{data.csvRows?.length} total contacts detected</span>
              </div>
              <div className="rounded-xl border border-border/70 overflow-hidden bg-card shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/60 text-muted-foreground border-b border-border/60 font-semibold">
                      <tr>
                        {csvPreview[0].map((h, i) => (
                          <th key={i} className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className={h === data.emailColumn ? "text-primary font-bold" : ""}>
                              {h}
                              {h === data.emailColumn && " (Email)"}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {csvPreview.slice(1).map((row, i) => (
                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                          {row.map((cell, j) => (
                            <td key={j} className="px-3.5 py-2.5 text-foreground truncate max-w-[200px]">
                              {cell || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </ScrollReveal>
      )}
    </div>
  );
}
