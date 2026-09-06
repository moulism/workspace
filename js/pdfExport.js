import { escapeHtml } from "./ui.js";

/**
 * Exports a note to PDF using the browser's native print-to-PDF — no extra
 * library, works everywhere, and respects the note's rich formatting
 * (bold, colors, headings, lists...) because it prints the real HTML.
 */
export function exportNoteToPdf(title, contentHtml) {
  const win = window.open("", "_blank", "width=850,height=1000");
  if (!win) {
    alert("Prohlížeč zablokoval vyskakovací okno. Povol ho pro export do PDF a zkus to znovu.");
    return;
  }
  const dateStr = new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
  win.document.write(`<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title || "Poznámka")}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 40px auto; padding: 0 24px;
         color: #1a1a1a; line-height: 1.65; font-size: 15px; }
  h1.doc-title { font-size: 24px; margin: 0 0 4px; font-family: -apple-system, Arial, sans-serif; }
  .doc-meta { color: #888; font-size: 12px; margin-bottom: 28px; font-family: -apple-system, Arial, sans-serif; }
  img { max-width: 100%; }
  blockquote { border-left: 3px solid #ccc; margin: 0; padding-left: 14px; color: #555; }
  ul, ol { padding-left: 22px; }
  @media print { body { margin: 0 auto; } }
</style>
</head>
<body>
  <h1 class="doc-title">${escapeHtml(title || "Poznámka")}</h1>
  <div class="doc-meta">Exportováno z Workspace &middot; ${dateStr}</div>
  ${contentHtml || "<p><em>(prázdná poznámka)</em></p>"}
  <script>
    window.onload = function () { window.focus(); window.print(); };
  </script>
</body>
</html>`);
  win.document.close();
}
