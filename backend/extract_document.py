#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def clean_text(value):
    return re.sub(r"[ \t]+", " ", (value or "").replace("\x00", "")).strip()


def detect_sections(full_text):
    patterns = [
        r"招标公告",
        r"投标人须知",
        r"资格条件|资格要求|资格审查",
        r"商务要求|商务条款",
        r"技术要求|技术参数|服务要求",
        r"评分标准|评分办法|评标办法",
        r"废标|无效投标|否决投标",
        r"响应文件格式|投标文件格式|文件格式",
        r"资料清单|附件|证明材料",
        r"采购需求|项目需求",
    ]
    sections = []
    for pattern in patterns:
        match = re.search(pattern, full_text)
        if match:
            start = max(0, match.start() - 120)
            end = min(len(full_text), match.end() + 500)
            sections.append({
                "title": match.group(0),
                "offset": match.start(),
                "snippet": clean_text(full_text[start:end])[:650],
            })
    return sections


def extract_pdf(path):
    import pdfplumber

    pages = []
    tables = []
    warnings = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages, 1):
            text = clean_text(page.extract_text() or "")
            page_tables = page.extract_tables() or []
            table_count = 0
            for table in page_tables:
                rows = []
                for row in table:
                    rows.append([clean_text(cell) for cell in row])
                if any(any(cell for cell in row) for row in rows):
                    table_count += 1
                    tables.append({"page": index, "rows": rows[:80]})
            if len(text) < 30:
                warnings.append(f"第{index}页文本较少，可能是扫描页或图片页，建议接入OCR复核。")
            pages.append({"page": index, "text": text, "charCount": len(text), "tableCount": table_count})
    return pages, tables, warnings


def extract_docx(path):
    from docx import Document

    doc = Document(path)
    blocks = []
    tables = []
    for para in doc.paragraphs:
        text = clean_text(para.text)
        if text:
            style = getattr(para.style, "name", "")
            blocks.append({"style": style, "text": text})
    for table in doc.tables:
        rows = []
        for row in table.rows:
            rows.append([clean_text(cell.text) for cell in row.cells])
        if any(any(cell for cell in row) for row in rows):
            tables.append({"page": None, "rows": rows[:120]})
    text = "\n".join(block["text"] for block in blocks)
    return [{"page": 1, "text": text, "charCount": len(text), "tableCount": len(tables)}], tables, []


def extract_doc(path):
    warnings = []
    if sys.platform != "darwin":
        return [], [], ["DOC老格式当前仅支持在macOS通过textutil转换；建议先转为DOCX。"]
    with tempfile.TemporaryDirectory() as tmp:
        result = subprocess.run(
            ["textutil", "-convert", "txt", "-output", os.path.join(tmp, "out.txt"), path],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return [], [], [f"DOC转换失败：{result.stderr.strip() or '未知错误'}"]
        text = Path(tmp, "out.txt").read_text("utf-8", errors="ignore")
    text = clean_text(text)
    if not text:
        warnings.append("DOC转换后未提取到有效文本，建议人工复核或转换为DOCX。")
    return [{"page": 1, "text": text, "charCount": len(text), "tableCount": 0}], [], warnings


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing file path"}, ensure_ascii=False))
        return 2

    path = sys.argv[1]
    ext = Path(path).suffix.lower()
    warnings = []
    try:
        if ext == ".pdf":
            pages, tables, warnings = extract_pdf(path)
        elif ext == ".docx":
            pages, tables, warnings = extract_docx(path)
        elif ext == ".doc":
            pages, tables, warnings = extract_doc(path)
        elif ext in [".txt", ".md"]:
            text = Path(path).read_text("utf-8", errors="ignore")
            pages, tables = [{"page": 1, "text": clean_text(text), "charCount": len(text), "tableCount": 0}], []
        elif ext in [".png", ".jpg", ".jpeg"]:
            pages, tables = [], []
            warnings = ["图片格式需要OCR服务；当前环境未接入OCR，建议后续接入PaddleOCR或Tesseract。"]
        else:
            pages, tables = [], []
            warnings = [f"暂不支持的文件格式：{ext}"]
    except Exception as exc:
        print(json.dumps({"error": str(exc), "pages": [], "tables": [], "warnings": [str(exc)]}, ensure_ascii=False))
        return 1

    full_text = "\n".join(page["text"] for page in pages if page.get("text"))
    result = {
        "fileName": Path(path).name,
        "fileType": ext.lstrip("."),
        "pageCount": len(pages),
        "charCount": len(full_text),
        "tableCount": len(tables),
        "pages": pages[:400],
        "tables": tables[:120],
        "sections": detect_sections(full_text),
        "warnings": warnings,
        "fullText": full_text[:240000],
        "quality": {
            "hasText": len(full_text) > 0,
            "likelyScanned": bool(pages) and sum(1 for page in pages if page.get("charCount", 0) < 30) / max(1, len(pages)) > 0.5,
            "needsOcr": bool(warnings and any("OCR" in item or "扫描" in item for item in warnings)),
            "textCoverage": round(sum(1 for page in pages if page.get("charCount", 0) >= 30) / max(1, len(pages)), 2) if pages else 0,
        },
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
