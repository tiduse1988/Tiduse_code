from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "智能投标系统需求文档.md"
OUTPUT = ROOT / "智能投标系统需求文档.docx"


BLUE = RGBColor(46, 116, 181)
DARK_BLUE = RGBColor(31, 77, 120)
INK = RGBColor(24, 32, 51)
MUTED = RGBColor(85, 85, 85)
BORDER = "D9E2F3"
HEADER_FILL = "F2F4F7"
CALLOUT_FILL = "F7FAFF"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(table, top=80, start=120, bottom=80, end=120) -> None:
    tbl_pr = table._tbl.tblPr
    tbl_cell_mar = tbl_pr.find(qn("w:tblCellMar"))
    if tbl_cell_mar is None:
        tbl_cell_mar = OxmlElement("w:tblCellMar")
        tbl_pr.append(tbl_cell_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tbl_cell_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tbl_cell_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color="D0D7E2", size="6") -> None:
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        node = borders.find(qn(tag))
        if node is None:
            node = OxmlElement(tag)
            borders.append(node)
        node.set(qn("w:val"), "single")
        node.set(qn("w:sz"), size)
        node.set(qn("w:space"), "0")
        node.set(qn("w:color"), color)


def set_table_width(table, widths_inches: list[float]) -> None:
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            if i < len(widths_inches):
                cell.width = Inches(widths_inches[i])
                tc_pr = cell._tc.get_or_add_tcPr()
                tc_w = tc_pr.find(qn("w:tcW"))
                if tc_w is None:
                    tc_w = OxmlElement("w:tcW")
                    tc_pr.append(tc_w)
                tc_w.set(qn("w:w"), str(int(widths_inches[i] * 1440)))
                tc_w.set(qn("w:type"), "dxa")
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER


def set_cjk_font(run, font_name="Microsoft YaHei") -> None:
    run.font.name = font_name
    r_pr = run._element.get_or_add_rPr()
    r_fonts = r_pr.rFonts
    if r_fonts is None:
        r_fonts = OxmlElement("w:rFonts")
        r_pr.append(r_fonts)
    r_fonts.set(qn("w:eastAsia"), font_name)
    r_fonts.set(qn("w:ascii"), font_name)
    r_fonts.set(qn("w:hAnsi"), font_name)


def add_run_with_inline_format(paragraph, text: str, bold_default=False):
    pos = 0
    for match in re.finditer(r"(`[^`]+`|\*\*[^*]+\*\*)", text):
        if match.start() > pos:
            run = paragraph.add_run(text[pos : match.start()])
            set_cjk_font(run)
        token = match.group(0)
        if token.startswith("`"):
            run = paragraph.add_run(token[1:-1])
            set_cjk_font(run, "Consolas")
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(80, 80, 80)
        else:
            run = paragraph.add_run(token[2:-2])
            set_cjk_font(run)
            run.bold = True
        pos = match.end()
    if pos < len(text):
        run = paragraph.add_run(text[pos:])
        set_cjk_font(run)
    for run in paragraph.runs:
        if bold_default:
            run.bold = True


def apply_paragraph_format(paragraph, after=6, before=0, line=1.1):
    paragraph.paragraph_format.space_after = Pt(after)
    paragraph.paragraph_format.space_before = Pt(before)
    paragraph.paragraph_format.line_spacing = line


def style_document(doc: Document) -> None:
    section = doc.sections[0]
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.1

    for name, size, color, before, after in [
        ("Heading 1", 16, BLUE, 16, 8),
        ("Heading 2", 13, BLUE, 12, 6),
        ("Heading 3", 12, DARK_BLUE, 8, 4),
        ("Heading 4", 11, DARK_BLUE, 6, 3),
    ]:
        style = styles[name]
        style.font.name = "Microsoft YaHei"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    header = section.header
    header_p = header.paragraphs[0]
    header_p.text = ""
    header_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = header_p.add_run("智能投标系统需求文档")
    set_cjk_font(r)
    r.font.size = Pt(9)
    r.font.color.rgb = MUTED

    footer = section.footer
    footer_p = footer.paragraphs[0]
    footer_p.text = ""
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = footer_p.add_run("内部需求说明 | 依据静态原型整理")
    set_cjk_font(r)
    r.font.size = Pt(9)
    r.font.color.rgb = MUTED


def add_cover(doc: Document) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(120)
    r = p.add_run("智能投标系统需求文档")
    set_cjk_font(r)
    r.font.size = Pt(26)
    r.font.bold = True
    r.font.color.rgb = BLUE

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.paragraph_format.space_after = Pt(22)
    r = subtitle.add_run("基于登录、项目列表、解析结果、目录生成、标书生成、标书核验界面整理")
    set_cjk_font(r)
    r.font.size = Pt(11)
    r.font.color.rgb = MUTED

    table = doc.add_table(rows=4, cols=2)
    table.style = "Table Grid"
    set_table_borders(table, "D9E2F3")
    set_cell_margins(table)
    set_table_width(table, [1.5, 4.8])
    rows = [
        ("版本", "V1.1"),
        ("编写日期", "2026-06-01"),
        ("文档来源", "当前工作区静态 HTML 原型"),
        ("适用对象", "产品、设计、前后端开发、测试、项目管理"),
    ]
    for row, (left, right) in zip(table.rows, rows):
        set_cell_shading(row.cells[0], HEADER_FILL)
        row.cells[0].text = left
        row.cells[1].text = right
        for cell in row.cells:
            for para in cell.paragraphs:
                for run in para.runs:
                    set_cjk_font(run)
                    run.font.size = Pt(10)
            row.cells[0].paragraphs[0].runs[0].bold = True

    doc.add_section(WD_SECTION.NEW_PAGE)


def parse_table(lines: list[str], start: int) -> tuple[list[list[str]], int]:
    rows = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        line = lines[i].strip()
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not all(re.fullmatch(r":?-{3,}:?", c.replace(" ", "")) for c in cells):
            rows.append(cells)
        i += 1
    return rows, i


def add_markdown_table(doc: Document, rows: list[list[str]]) -> None:
    if not rows:
        return
    cols = max(len(row) for row in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    table.style = "Table Grid"
    set_table_borders(table)
    set_cell_margins(table)

    if cols == 2:
        widths = [1.9, 4.4]
    elif cols == 3:
        widths = [1.45, 2.0, 2.85]
    elif cols == 4:
        widths = [1.1, 1.6, 1.9, 1.7]
    elif cols == 5:
        widths = [0.9, 1.3, 1.6, 1.4, 1.1]
    else:
        widths = [6.3 / cols] * cols
    set_table_width(table, widths)

    for r_idx, row_data in enumerate(rows):
        for c_idx in range(cols):
            cell = table.cell(r_idx, c_idx)
            text = row_data[c_idx] if c_idx < len(row_data) else ""
            cell.text = ""
            p = cell.paragraphs[0]
            apply_paragraph_format(p, after=0, line=1.05)
            add_run_with_inline_format(p, text)
            for run in p.runs:
                run.font.size = Pt(8.8 if cols >= 4 else 9.2)
            if r_idx == 0:
                set_cell_shading(cell, HEADER_FILL)
                for run in p.runs:
                    run.bold = True
                    run.font.color.rgb = INK
            if c_idx > 0 and len(text) <= 12:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()


def add_code_block(doc: Document, content: str, lang: str) -> None:
    if lang == "mermaid":
        p = doc.add_paragraph("流程图（Mermaid 源码）：")
        p.style = "Heading 4"
    p = doc.add_paragraph()
    apply_paragraph_format(p, after=8, before=4, line=1.0)
    run = p.add_run(content.strip())
    set_cjk_font(run, "Consolas")
    run.font.size = Pt(8.5)
    p.paragraph_format.left_indent = Inches(0.18)
    p.paragraph_format.right_indent = Inches(0.18)


def add_body_paragraph(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    apply_paragraph_format(p)
    add_run_with_inline_format(p, text)


def add_list_item(doc: Document, text: str, ordered: bool) -> None:
    p = doc.add_paragraph(style="List Number" if ordered else "List Bullet")
    apply_paragraph_format(p, after=4, line=1.1)
    add_run_with_inline_format(p, text)


def build_doc() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    doc = Document()
    style_document(doc)
    add_cover(doc)

    i = 0
    in_code = False
    code_lang = ""
    code_lines: list[str] = []

    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()

        if line.startswith("```"):
            if not in_code:
                in_code = True
                code_lang = line[3:].strip()
                code_lines = []
            else:
                add_code_block(doc, "\n".join(code_lines), code_lang)
                in_code = False
                code_lang = ""
            i += 1
            continue

        if in_code:
            code_lines.append(raw)
            i += 1
            continue

        if not line.strip():
            i += 1
            continue

        if line.strip().startswith("|"):
            rows, i = parse_table(lines, i)
            add_markdown_table(doc, rows)
            continue

        heading = re.match(r"^(#{1,4})\s+(.*)$", line)
        if heading:
            level = len(heading.group(1))
            text = heading.group(2).strip()
            if level == 1 and text == "智能投标系统需求文档":
                i += 1
                continue
            para = doc.add_paragraph(style=f"Heading {min(level, 4)}")
            add_run_with_inline_format(para, text, bold_default=True)
            i += 1
            continue

        ordered = re.match(r"^\d+\.\s+(.*)$", line)
        if ordered:
            add_list_item(doc, ordered.group(1), True)
            i += 1
            continue

        bullet = re.match(r"^[-*]\s+(.*)$", line)
        if bullet:
            add_list_item(doc, bullet.group(1), False)
            i += 1
            continue

        add_body_paragraph(doc, line)
        i += 1

    doc.save(OUTPUT)
    patch_docx_for_field_codes(OUTPUT)


def patch_docx_for_field_codes(path: Path) -> None:
    # Keep the generated file deterministic and remove a few python-docx leftovers.
    tmp = path.with_suffix(".tmp.docx")
    with zipfile.ZipFile(path, "r") as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            data = src.read(info.filename)
            if info.filename == "docProps/core.xml":
                core = data.decode("utf-8")
                core = re.sub(r"<dc:creator>.*?</dc:creator>", "<dc:creator>Codex</dc:creator>", core)
                core = re.sub(
                    r"<cp:lastModifiedBy>.*?</cp:lastModifiedBy>",
                    "<cp:lastModifiedBy>Codex</cp:lastModifiedBy>",
                    core,
                )
                data = core.encode("utf-8")
            dst.writestr(info, data)
    tmp.replace(path)


if __name__ == "__main__":
    build_doc()
    print(OUTPUT)
