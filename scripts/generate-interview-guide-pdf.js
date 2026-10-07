const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const root = path.resolve(__dirname, "..");
const inputPath = path.join(root, "docs", "banking-ledger-system-interview-guide.md");
const outputPath = path.join(root, "docs", "banking-ledger-system-interview-guide.pdf");

if (!fs.existsSync(inputPath)) {
  throw new Error(`Source markdown not found at ${inputPath}`);
}

const markdown = fs.readFileSync(inputPath, "utf8");

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 40, bottom: 40, left: 40, right: 40 },
});

const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

const drawLine = (line) => {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 20) {
    doc.addPage();
  }

  if (line.startsWith("### ")) {
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).text(line.replace(/^###\s+/, ""));
    doc.moveDown(0.1);
    return;
  }

  if (line.startsWith("## ")) {
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(13).text(line.replace(/^##\s+/, ""));
    doc.moveDown(0.2);
    return;
  }

  if (line.startsWith("# ")) {
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(16).text(line.replace(/^#\s+/, ""));
    doc.moveDown(0.3);
    return;
  }

  if (line.trim() === "---") {
    const y = doc.y + 4;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke();
    doc.moveDown(0.6);
    return;
  }

  doc.font("Helvetica").fontSize(10).text(line.length ? line : " ");
};

markdown.replace(/\r\n/g, "\n").split("\n").forEach(drawLine);

doc.end();

stream.on("finish", () => {
  process.stdout.write(`Generated PDF at ${outputPath}\n`);
});
