import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
import lxml.etree as etree
from diagram_renderer import render_diagram_slide

# Layout indices (mapped to standard professional template)
LAYOUT_MAP = {
    "title": 0,       # Title Slide
    "bullets": 1,     # Title and Content
    "divider": 2,     # Section Header
    "two_column": 3,  # Two Content
    "comparison": 4,  # Comparison
    "title_only": 5,  # Title Only
    "blank": 6,       # Blank
    "highlight": 7,   # Content with Caption
}


def _delete_all_slides(prs):
    """Remove all pre-existing slides from the template, keeping only layouts."""
    slide_id_list = prs.slides._sldIdLst
    for sldId in list(slide_id_list):
        rId = sldId.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        if rId:
            prs.part.drop_rel(rId)
        slide_id_list.remove(sldId)


def _render_divider(prs, slide_data):
    """Render a section divider slide using the Section Header layout."""
    layout_idx = LAYOUT_MAP.get("divider", 2)
    if layout_idx >= len(prs.slide_layouts):
        layout_idx = 0

    slide_layout = prs.slide_layouts[layout_idx]
    slide = prs.slides.add_slide(slide_layout)

    # Set title
    if hasattr(slide.shapes, "title") and slide.shapes.title:
        title_shape = slide.shapes.title
        title_shape.text = slide_data.get("title", "")

        for paragraph in title_shape.text_frame.paragraphs:
            paragraph.alignment = PP_ALIGN.LEFT
            for run in paragraph.runs:
                run.font.size = Pt(36)
                run.font.bold = True

    # Handle subtitle/body placeholder
    subtitle_text = slide_data.get("subtitle", "")
    for shape in slide.placeholders:
        if shape == slide.shapes.title:
            continue
        if hasattr(shape, "text_frame"):
            shape.text_frame.clear()
            if subtitle_text:
                p = shape.text_frame.paragraphs[0]
                p.text = subtitle_text
                p.alignment = PP_ALIGN.LEFT
                for run in p.runs:
                    run.font.size = Pt(20)
                    run.font.bold = False
            else:
                shape.text_frame.paragraphs[0].text = ""

    return slide


def _render_content_slide(prs, slide_data):
    """Render a standard content slide with title and bullets."""
    layout_idx = LAYOUT_MAP.get(slide_data.get("type", "bullets"), 1)

    if layout_idx >= len(prs.slide_layouts):
        layout_idx = 1

    slide_layout = prs.slide_layouts[layout_idx]
    slide = prs.slides.add_slide(slide_layout)

    # Set Title
    if hasattr(slide.shapes, "title") and slide.shapes.title:
        slide.shapes.title.text = slide_data.get("title", "")

    # Find the body placeholder
    body_shape = None
    for shape in slide.placeholders:
        if shape.placeholder_format.type in [1, 2, 7]:  # Body, Object, or Text
            if shape == slide.shapes.title:
                continue
            body_shape = shape
            break

    if body_shape:
        tf = body_shape.text_frame
        tf.clear()

        bullets = slide_data.get("bullets", [])
        for i, bullet_text in enumerate(bullets):
            if i == 0:
                p = tf.paragraphs[0]
            else:
                p = tf.add_paragraph()

            p.text = bullet_text
            p.level = 0

    return slide


def render_ppt(data, template_path, output_path):
    """
    Renders the presentation data into a PPTX file using the template.
    Removes all pre-existing template slides first (keeps only layouts/theme).
    """
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found at {template_path}")

    prs = Presentation(template_path)

    # Remove all pre-existing slides from template
    _delete_all_slides(prs)

    # Render all slides from data
    for slide_data in data.get("slides", []):
        slide_type = slide_data.get("type", "bullets")

        if slide_type == "divider":
            _render_divider(prs, slide_data)
        elif slide_type == "diagram":
            # For Flux, renderer needs nvidia_key. The `render_ppt` function doesn't currently take it.
            # I should update `render_ppt` signature to take `api_key=None`
            api_key = data.get("nvidia_key")
            render_diagram_slide(prs, slide_data, api_key)
        else:
            _render_content_slide(prs, slide_data)

    prs.save(output_path)
    return output_path
