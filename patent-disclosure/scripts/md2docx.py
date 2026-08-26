#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""技术交底书 Markdown -> docx 固定转换脚本。

用法:
    python3 md2docx.py 交底书_<主题>.md [输出.docx]

输出默认与输入同名（.docx 后缀）。格式按公司交底书模板固化：
正文五号宋体 1.5 倍行距、首行缩进 2 字符；一级标题四号黑体、二级标题小四
黑体；表格 Table Grid + 加粗表头；代码块 Consolas 9pt；图片居中限宽 14cm，
alt 文本作为图注；`[图N：...]` 占位行渲染为居中加粗占位。

本脚本只依赖 python-docx（本机已装）。格式调整改这里，不改各次交底书。
"""
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

# ── 字体规格（黑体标题 / 宋体正文 / Times 西文 / Consolas 代码）───────────
F_HEI, F_SONG, F_LATIN, F_MONO = '黑体', '宋体', 'Times New Roman', 'Consolas'
SZ_TITLE, SZ_H1, SZ_H2, SZ_H3, SZ_BODY, SZ_CODE, SZ_CAP = 16, 14, 12, 11, 10.5, 9, 9

IMG_RE = re.compile(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$')
PH_RE = re.compile(r'^\[图[^\]]*\]')            # [图N：名称] 非流程图占位
INLINE_RE = re.compile(r'(\*\*.+?\*\*|`[^`]+`)')


def style_run(run, east=F_SONG, latin=F_LATIN, size=SZ_BODY, bold=False,
              mono=False, color=None):
    run.font.name = F_MONO if mono else latin
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'),
                                                          F_MONO if mono else east)
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)


def add_inline(par, text, size=SZ_BODY, bold_all=False):
    """解析 **加粗** 与 `行内代码` 后写入段落。"""
    for part in INLINE_RE.split(text):
        if not part:
            continue
        if part.startswith('**') and part.endswith('**') and len(part) > 4:
            style_run(par.add_run(part[2:-2]), size=size, bold=True)
        elif part.startswith('`') and part.endswith('`') and len(part) > 2:
            style_run(par.add_run(part[1:-1]), size=size, mono=True)
        else:
            style_run(par.add_run(part), size=size, bold=bold_all)


def para(doc, align=None, indent=False, spacing=1.5, before=0, after=0):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.alignment = align if align is not None else WD_ALIGN_PARAGRAPH.JUSTIFY
    if indent:
        pf.first_line_indent = Pt(SZ_BODY * 2)
    pf.line_spacing = spacing
    pf.space_before, pf.space_after = Pt(before), Pt(after)
    return p


def add_heading(doc, text, level):
    size, before, after = {1: (SZ_H1, 12, 6), 2: (SZ_H2, 8, 4), 3: (SZ_H3, 6, 3)}[level]
    p = para(doc, WD_ALIGN_PARAGRAPH.LEFT, spacing=1.3, before=before, after=after)
    add_inline(p, text, size=size, bold_all=True)
    for r in p.runs:                      # 标题用黑体
        r._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), F_HEI)


def add_table(doc, rows):
    cells = [[c.strip() for c in r.strip().strip('|').split('|')] for r in rows]
    cells = [r for r in cells if not all(re.fullmatch(r':?-{2,}:?', c or '-') for c in r)]
    if not cells:
        return
    width = max(len(r) for r in cells)
    table = doc.add_table(rows=len(cells), cols=width)
    table.style = 'Table Grid'
    for i, row in enumerate(cells):
        for j in range(width):
            text = row[j] if j < len(row) else ''
            cell = table.cell(i, j)
            cell.text = ''
            p = cell.paragraphs[0]
            p.paragraph_format.line_spacing = 1.2
            add_inline(p, text, size=SZ_BODY, bold_all=(i == 0))


def convert(md_path, docx_path=None):
    md_path = Path(md_path)
    docx_path = Path(docx_path) if docx_path else md_path.with_suffix('.docx')
    doc = Document()
    lines = md_path.read_text(encoding='utf-8').splitlines()

    i, in_code, code_buf, table_buf = 0, False, [], []
    def flush_table():
        nonlocal table_buf
        if table_buf:
            add_table(doc, table_buf)
            table_buf = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 围栏代码块
        if stripped.startswith('```'):
            flush_table()
            if in_code:
                for code_line in code_buf:
                    p = para(doc, WD_ALIGN_PARAGRAPH.LEFT, spacing=1.0, after=0)
                    style_run(p.add_run(code_line or ' '), size=SZ_CODE, mono=True)
                para(doc, after=4)
                code_buf = []
            in_code = not in_code
            i += 1
            continue
        if in_code:
            code_buf.append(line)
            i += 1
            continue

        # 表格行
        if stripped.startswith('|') and stripped.endswith('|'):
            table_buf.append(stripped)
            i += 1
            continue
        flush_table()

        if not stripped or re.fullmatch(r'-{3,}', stripped):
            i += 1
            continue

        m = IMG_RE.match(stripped)                        # 图片
        if m:
            alt, path = m.group(1), m.group(2)
            img = Path(path)
            if not img.is_absolute():
                img = md_path.parent / img                # 相对路径按 md 所在目录解析
            try:
                doc.add_picture(str(img), width=Cm(14))
                doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                if alt:
                    p = para(doc, WD_ALIGN_PARAGRAPH.CENTER, spacing=1.0, after=8)
                    style_run(p.add_run(alt), size=SZ_CAP, color=(0x60, 0x60, 0x60))
            except Exception as err:                      # 图片缺失时降级为占位
                p = para(doc, WD_ALIGN_PARAGRAPH.CENTER)
                style_run(p.add_run(f'[图片缺失：{path}（{err}）]'),
                          size=SZ_BODY, bold=True, color=(0xC0, 0x39, 0x2B))
            i += 1
            continue

        if stripped.startswith('#'):                      # 标题
            level = len(stripped) - len(stripped.lstrip('#'))
            text = stripped.lstrip('#').strip()
            if level == 1:                                # 文档主标题
                p = para(doc, WD_ALIGN_PARAGRAPH.CENTER, spacing=1.3, after=12)
                style_run(p.add_run(text), east=F_HEI, size=SZ_TITLE, bold=True)
            else:
                add_heading(doc, text, min(level - 1, 3))
            i += 1
            continue

        if PH_RE.match(stripped):                         # 非流程图占位
            p = para(doc, WD_ALIGN_PARAGRAPH.CENTER, spacing=1.3, before=6, after=6)
            style_run(p.add_run(stripped), east=F_HEI, size=SZ_H3, bold=True,
                      color=(0x88, 0x88, 0x88))
            i += 1
            continue

        if stripped.startswith('>'):                      # 引用
            p = para(doc, indent=True)
            add_inline(p, stripped.lstrip('> ').strip())
            for r in p.runs:
                r.font.italic = True
            i += 1
            continue

        m = re.match(r'^[-*]\s+(.*)$', stripped)           # 无序列表
        if m:
            p = para(doc, WD_ALIGN_PARAGRAPH.LEFT)
            p.paragraph_format.left_indent = Cm(0.74)
            style_run(p.add_run('• '), size=SZ_BODY, bold=True)
            add_inline(p, m.group(1))
            i += 1
            continue

        m = re.match(r'^(\d+)[.、)]\s+(.*)$', stripped)     # 有序列表
        if m:
            p = para(doc, WD_ALIGN_PARAGRAPH.LEFT)
            p.paragraph_format.left_indent = Cm(0.74)
            style_run(p.add_run(m.group(1) + '. '), size=SZ_BODY, bold=True)
            add_inline(p, m.group(2))
            i += 1
            continue

        p = para(doc, indent=True)                        # 普通段落
        add_inline(p, stripped)
        i += 1

    flush_table()
    doc.save(docx_path)
    return docx_path


def main():
    if len(sys.argv) < 2:
        sys.exit('用法: python3 md2docx.py 交底书_<主题>.md [输出.docx]')
    out = convert(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print(f'saved: {out}')


if __name__ == '__main__':
    main()
