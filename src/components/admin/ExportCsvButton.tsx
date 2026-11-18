import { Download } from "lucide-react";
import { Button } from "@/components/admin/Button";
import { downloadCsv } from "@/lib/csv";

export function ExportCsvButton({
  filename,
  headers,
  getRows,
  disabled,
}: {
  filename: string;
  headers: string[];
  getRows: () => unknown[][];
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => downloadCsv(filename, headers, getRows())}
    >
      <Download className="h-4 w-4" /> Export CSV
    </Button>
  );
}
