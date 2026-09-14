import { escapeHtml } from "./ui.js";

function docHtml(title, contentHtml) {
  const dateStr = new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
  return `<!doctype html>
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
  hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
  .todo-line { display: flex; gap: 8px; align-items: flex-start; margin: 4px 0; }
  .todo-line input { margin-top: 4px; }
  @media print { body { margin: 0 auto; } }
</style>
</head>
<body>
  <h1 class="doc-title">${escapeHtml(title || "Poznámka")}</h1>
  <div class="doc-meta">Exportováno z Workspace &middot; ${dateStr}</div>
  ${contentHtml || "<p><em>(prázdná poznámka)</em></p>"}
</body>
</html>`;
}

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
  win.document.write(
    docHtml(title, contentHtml) + `<script>window.onload=function(){window.focus();window.print();};</script>`
  );
  win.document.close();
}

/**
 * Downloads the note as a standalone .html file — handy for sending a note
 * to friends who don't use the app (opens fine in any browser, no login needed).
 */
export function exportNoteToHtmlFile(title, contentHtml) {
  const html = docHtml(title, contentHtml);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (title || "poznamka").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "poznamka";
  a.download = `${safeName}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
