const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const downloadTimeSeriesCsv = (timeSeriesLog, filePrefix = "session_biomechanics") => {
  const rows = Array.isArray(timeSeriesLog) ? timeSeriesLog : [];
  if (!rows.length) return;

  const headers = ["timestamp", "smoothedAngle", "velocity", "stage"];
  const csvLines = [
    headers.join(","),
    ...rows.map((entry) =>
      [
        entry?.timestamp ?? "",
        entry?.smoothedAngle ?? "",
        entry?.velocity ?? "",
        entry?.stage ?? "",
      ]
        .map(escapeCsvValue)
        .join(",")
    ),
  ];

  const dateStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filePrefix}_${dateStamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
