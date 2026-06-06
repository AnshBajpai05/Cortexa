"""
PDF → Markdown (digital path)
=============================
Lightweight, standalone extractor for Cortexa's upload connector.

Reuses the technique from the NLP project's pdf_processing pipeline
(PyMuPDF blocks, two-column detection + reorder, font-size heading detection)
but decoupled — no `pipeline.*` package, no manifests, no models. Digital PDFs
only; scanned PDFs are flagged (OCR is a separate, heavier path).
"""
import re
from typing import List, Dict, Any

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None

# Tunables (mirrors pdf_processing/pipeline.config defaults)
HEADING_FONT_SIZE_MIN = 13.0
COLUMN_GAP_THRESHOLD = 0.15
MIN_CHARS_PER_PAGE_DIGITAL = 100


def _detect_two_column(x0s: List[float], page_width: float) -> float | None:
    """Return split x-midpoint if page is two-column, else None."""
    xs = sorted(set(round(x, 1) for x in x0s))
    if len(xs) < 2:
        return None
    max_gap, split = 0.0, 0.0
    for i in range(len(xs) - 1):
        gap = xs[i + 1] - xs[i]
        if gap > max_gap:
            max_gap, split = gap, (xs[i] + xs[i + 1]) / 2
    return split if max_gap > page_width * COLUMN_GAP_THRESHOLD else None


def _heading_prefix(size: float) -> str:
    if size >= 18:
        return "# "
    if size >= 15:
        return "## "
    if size >= HEADING_FONT_SIZE_MIN:
        return "### "
    return ""


def _page_to_md(page) -> str:
    """Convert one page to markdown using font-aware blocks + column reorder."""
    try:
        pd = page.get_text("dict")
    except Exception:
        return page.get_text("text").strip()

    page_width = page.rect.width
    blocks = []
    for b in pd.get("blocks", []):
        if b.get("type") != 0:
            continue
        parts, sizes = [], []
        for line in b.get("lines", []):
            for span in line.get("spans", []):
                t = span.get("text", "").strip()
                if t:
                    parts.append(t)
                    sizes.append(span.get("size", 0.0))
        if not parts:
            continue
        bbox = b.get("bbox", (0, 0, 0, 0))
        blocks.append({
            "text": " ".join(parts),
            "size": round(sum(sizes) / len(sizes), 1) if sizes else 0.0,
            "x0": bbox[0], "y0": bbox[1],
        })

    if not blocks:
        return ""

    # Reading order: two-column → left col top-down, then right col; else top-down.
    split = _detect_two_column([b["x0"] for b in blocks], page_width)
    if split is not None:
        left = sorted([b for b in blocks if b["x0"] < split], key=lambda b: b["y0"])
        right = sorted([b for b in blocks if b["x0"] >= split], key=lambda b: b["y0"])
        ordered = left + right
    else:
        ordered = sorted(blocks, key=lambda b: (b["y0"], b["x0"]))

    out = []
    for b in ordered:
        text = re.sub(r"\s+", " ", b["text"]).strip()
        if not text:
            continue
        out.append(f"{_heading_prefix(b['size'])}{text}")
    return "\n\n".join(out)


def pdf_bytes_to_md(data: bytes, max_pages: int | None = None) -> Dict[str, Any]:
    """
    Convert PDF bytes → markdown.

    Returns: { markdown, pages, chars, scanned, title }
    Raises ValueError on encrypted/unreadable PDFs.
    """
    if fitz is None:
        raise RuntimeError("PyMuPDF (fitz) not installed — add 'PyMuPDF' to requirements.txt")

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Could not open PDF: {e}")

    if doc.is_encrypted:
        doc.close()
        raise ValueError("PDF is password-protected")
    if doc.page_count == 0:
        doc.close()
        raise ValueError("PDF has 0 pages")

    title = (doc.metadata or {}).get("title", "").strip()

    n = doc.page_count if max_pages is None else min(max_pages, doc.page_count)
    page_mds: List[str] = []
    total_chars = 0
    for i in range(n):
        md = _page_to_md(doc[i])
        total_chars += len(md)
        if md:
            page_mds.append(md)
    doc.close()

    avg = total_chars / n if n else 0
    scanned = avg < MIN_CHARS_PER_PAGE_DIGITAL

    markdown = "\n\n".join(page_mds).strip()
    if scanned and not markdown:
        markdown = "[scanned PDF — no embedded text. OCR path not enabled.]"

    return {
        "markdown": markdown,
        "pages": n,
        "chars": total_chars,
        "scanned": scanned,
        "title": title,
    }
