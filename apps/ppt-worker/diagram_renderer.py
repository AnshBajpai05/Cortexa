import logging
import re
import requests
import io
from pptx.util import Inches, Pt
from collections import defaultdict, deque

logger = logging.getLogger(__name__)

# --- DIAGRAM CONFIG ---
NODE_WIDTH = 2.5
NODE_HEIGHT = 1.0
X_SPACING = 3.5
Y_SPACING = 2.0

def _render_programmatic_diagram(slide, spec):
    """
    Renders the diagram using python-pptx shapes and connectors based on Kahn's topological sort.
    """
    graph = spec.get("graph", {})
    layout_mode = spec.get("layout", "left-right")
    
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    groups = graph.get("groups", {})
    
    if not nodes:
        return

    # 1. Build adjacency + in-degree
    adj = defaultdict(list)
    in_degree = {n: 0 for n in nodes}
    
    # Add any nodes missing from edges
    for n in nodes:
        if n not in in_degree:
            in_degree[n] = 0

    valid_edges = []
    for edge in edges:
        if len(edge) == 2:
            u, v = edge
            if u in in_degree and v in in_degree:
                adj[u].append(v)
                in_degree[v] += 1
                valid_edges.append((u, v))

    # 2. Topological Layering (Kahn's)
    levels = defaultdict(list)
    queue = deque()

    # Start nodes (entry points)
    for n in nodes:
        if in_degree[n] == 0:
            queue.append((n, 0))

    visited = set()
    
    # Handle cycles/disconnected by keeping track of processed
    processed_count = 0

    while queue:
        node, level = queue.popleft()
        if node in visited:
            continue

        visited.add(node)
        levels[level].append(node)
        processed_count += 1

        for nei in adj[node]:
            in_degree[nei] -= 1
            if in_degree[nei] == 0:
                queue.append((nei, level + 1))
                
    # Fallback for cycles: anything not visited goes to a new layer
    if processed_count < len(nodes):
        cycle_level = max(levels.keys() or [-1]) + 1
        for n in nodes:
            if n not in visited:
                levels[cycle_level].append(n)
                visited.add(n)

    # 3. Coordinate Calculation
    positions = {}
    
    if layout_mode == "top-down":
        for level, nodes_in_level in levels.items():
            y = level * Y_SPACING
            count = len(nodes_in_level)
            total_width = (count - 1) * X_SPACING
            
            for i, node in enumerate(nodes_in_level):
                x = i * X_SPACING - total_width / 2
                positions[node] = (x, y)
    else:
        # left-right
        for level, nodes_in_level in levels.items():
            x = level * X_SPACING
            count = len(nodes_in_level)
            total_height = (count - 1) * Y_SPACING
            
            for i, node in enumerate(nodes_in_level):
                y = i * Y_SPACING - total_height / 2
                positions[node] = (x, y)

    # Auto-Scaling to fit slide (approx 9x5.5 area)
    if positions:
        min_x = min(x for x, y in positions.values())
        max_x = max(x for x, y in positions.values())
        min_y = min(y for x, y in positions.values())
        max_y = max(y for x, y in positions.values())
        
        diag_w = max_x - min_x + NODE_WIDTH
        diag_h = max_y - min_y + NODE_HEIGHT
        
        scale = min(9.0 / diag_w if diag_w > 9.0 else 1.0, 5.5 / diag_h if diag_h > 5.5 else 1.0)
        
        for n, (x, y) in positions.items():
            positions[n] = ((x - min_x) * scale, (y - min_y) * scale)
            
        n_width = NODE_WIDTH * scale
        n_height = NODE_HEIGHT * scale
    else:
        n_width = NODE_WIDTH
        n_height = NODE_HEIGHT
        scale = 1.0

    # 4. Handle Visual Groups
    if groups:
        for group_name, group_nodes in groups.items():
            valid_group_nodes = [n for n in group_nodes if n in positions]
            if not valid_group_nodes:
                continue
                
            xs = [positions[n][0] for n in valid_group_nodes]
            ys = [positions[n][1] for n in valid_group_nodes]
            
            g_min_x, g_max_x = min(xs), max(xs)
            g_min_y, g_max_y = min(ys), max(ys)
            
            # Offsets for centering on slide
            base_x_offset = 5.0 if layout_mode == "top-down" else 1.0
            base_y_offset = 1.0 if layout_mode == "top-down" else 3.5
            
            # Note: Because of scaling, center offset logic might need adjustment.
            # We simply center the whole scaled diagram
            total_scaled_w = max(x for x,y in positions.values()) + n_width
            total_scaled_h = max(y for x,y in positions.values()) + n_height
            
            slide_center_x = 5.0
            slide_center_y = 4.0
            start_x_inches = slide_center_x - (total_scaled_w / 2)
            start_y_inches = slide_center_y - (total_scaled_h / 2)
            
            left = Inches(start_x_inches + g_min_x - (0.2 * scale))
            top = Inches(start_y_inches + g_min_y - (0.3 * scale))
            width = Inches((g_max_x - g_min_x) + n_width + (0.4 * scale))
            height = Inches((g_max_y - g_min_y) + n_height + (0.4 * scale))
            
            group_shape = slide.shapes.add_shape(1, left, top, width, height)
            group_shape.fill.background()
            group_shape.text = group_name
            for paragraph in group_shape.text_frame.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(int(12 * scale) if scale < 1.0 else 12)
                    run.font.bold = True

    # 5. Create Nodes
    node_shapes = {}
    total_scaled_w = max(x for x,y in positions.values()) + n_width if positions else 0
    total_scaled_h = max(y for x,y in positions.values()) + n_height if positions else 0
    slide_center_x = 5.0
    slide_center_y = 4.0
    start_x_inches = slide_center_x - (total_scaled_w / 2)
    start_y_inches = slide_center_y - (total_scaled_h / 2)

    for node, (x, y) in positions.items():
        left = Inches(start_x_inches + x)
        top = Inches(start_y_inches + y)
            
        shape = slide.shapes.add_shape(
            1,  # rectangle
            left,
            top,
            Inches(n_width),
            Inches(n_height)
        )
        shape.text = node
        # Adjust font size if scaled down heavily
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                run.font.size = Pt(int(14 * scale) if scale < 1.0 else 14)
        node_shapes[node] = shape

    # 6. Draw Connectors
    # python-pptx connectors can be tricky. We just use straight lines for now.
    for u, v in valid_edges:
        if u in node_shapes and v in node_shapes:
            shape_u = node_shapes[u]
            shape_v = node_shapes[v]
            
            # Start from bottom of U if top-down, right of U if left-right
            if layout_mode == "top-down":
                start_x = shape_u.left + shape_u.width / 2
                start_y = shape_u.top + shape_u.height
                end_x = shape_v.left + shape_v.width / 2
                end_y = shape_v.top
            else:
                start_x = shape_u.left + shape_u.width
                start_y = shape_u.top + shape_u.height / 2
                end_x = shape_v.left
                end_y = shape_v.top + shape_v.height / 2
                
            connector = slide.shapes.add_connector(
                1,  # straight line
                start_x, start_y, end_x, end_y
            )

def _render_flux_diagram(slide, spec, api_key):
    """
    Renders the diagram by calling NVIDIA NIM FLUX.1-dev and placing the image on the slide.
    """
    # 1. Use the explicitly passed key, or fallback to environment (least preferred)
    active_key = api_key or os.getenv("NVIDIA_IMAGE_KEY")
    
    if not active_key:
        logger.warning("No NVIDIA API key provided for Flux rendering. Falling back to programmatic.")
        _add_failure_placeholder(slide, "API Key Missing (NVIDIA_IMAGE_KEY)")
        _render_programmatic_diagram(slide, spec)
        return

    prompt = spec.get("diagram_prompt", "")
    if not prompt:
        logger.warning("No prompt provided for Flux. Falling back to programmatic.")
        _render_programmatic_diagram(slide, spec)
        return

    logger.info(f"Generating Flux diagram image with prompt length: {len(prompt)}")
    
    try:
        response = requests.post(
            "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
            headers={
                "Authorization": f"Bearer {active_key}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json={
                "prompt": prompt,
                "seed": 42,
                "steps": 30
            },
            timeout=120
        )
        
        if response.status_code == 200:
            data = response.json()
            b64_img = (
                data.get("b64_json") or 
                (data.get("data") and data["data"][0].get("b64_json")) or
                (data.get("artifacts") and data["artifacts"][0].get("base64"))
            )
            if b64_img:
                import base64
                import uuid
                import os
                
                img_bytes = base64.b64decode(b64_img)
                image_stream = io.BytesIO(img_bytes)
                
                # Save to disk to create a URL for zooming
                filename = f"diagram_{uuid.uuid4().hex[:8]}.png"
                scratch_dir = os.path.join(os.getcwd(), "scratch", "assets")
                os.makedirs(scratch_dir, exist_ok=True)
                file_path = os.path.join(scratch_dir, filename)
                with open(file_path, "wb") as f:
                    f.write(img_bytes)
                
                # Add picture to slide (Centered)
                slide.shapes.add_picture(image_stream, Inches(1), Inches(1.5), width=Inches(8))
                
                # Add link text
                txBox = slide.shapes.add_textbox(Inches(1), Inches(6.8), Inches(8), Inches(0.5))
                tf = txBox.text_frame
                p = tf.add_paragraph()
                p.text = "🔍 Click here to view High-Resolution Diagram"
                p.runs[0].font.size = Pt(14)
                p.runs[0].hyperlink.address = f"file:///{file_path.replace(chr(92), '/')}"
                
                logger.info("Flux diagram rendered successfully.")
                return
            else:
                logger.error(f"Flux returned 200 but no image data found in payload: {data.keys()}")
        
        logger.error(f"Flux generation failed: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Flux exception: {e}")
        
    logger.warning("Flux failed. Adding failure placeholder and falling back to programmatic.")
    _add_failure_placeholder(slide, "Flux Generation Failed/Timeout")
    _render_programmatic_diagram(slide, spec)

def _add_failure_placeholder(slide, reason):
    """Adds a visible red placeholder if AI rendering fails."""
    try:
        left = Inches(0.5)
        top = Inches(0.8)
        width = Inches(9)
        height = Inches(0.4)
        
        # Create a subtle but visible warning bar
        rect = slide.shapes.add_shape(1, left, top, width, height)
        rect.fill.solid()
        rect.fill.fore_color.rgb = RGBColor(255, 230, 230) # Light red background
        rect.line.color.rgb = RGBColor(255, 0, 0) # Red border
        
        tf = rect.text_frame
        p = tf.paragraphs[0]
        p.text = f"⚠️ AI Diagram Rendering Unavailable: {reason}. Falling back to schematic view."
        for run in p.runs:
            run.font.size = Pt(11)
            run.font.color.rgb = RGBColor(150, 0, 0) # Dark red text
    except Exception as e:
        logger.error(f"Failed to add failure placeholder: {e}")

# Import RGBColor if not already present
from pptx.dml.color import RGBColor

# ─── MERMAID SANITIZER (GENERIC) ─────────────────────────────────────────────

def _sanitize_mermaid_code(code):
    """
    Generic sanitizer for LLM-generated Mermaid.js code.
    Fixes the most common LLM output issues that cause mermaid.ink 400 errors.
    """
    if not code:
        return code

    # 1. Strip markdown code fences (```mermaid ... ```)
    code = re.sub(r'```(?:mermaid)?\s*', '', code)

    # 2. Replace literal \n with actual newlines (LLMs often serialize this way)
    code = code.replace('\\n', '\n')

    # 3. Fix arrow syntax: single -> should be -->
    #    But don't break existing --> or --->
    code = re.sub(r'(?<!-)(?<!>)->', '-->', code)

    # 4. Remove HTML tags that LLMs sometimes inject
    code = re.sub(r'<br\s*/?>', '\n', code)
    code = re.sub(r'<[^>]+>', '', code)

    # 5. Fix semicolons: mermaid.js accepts ; at end of lines but not required.
    #    Remove double semicolons which cause parse errors.
    code = code.replace(';;', ';')

    # 5b. Remove colons after node/edge definitions (LLMs write A[label]: which is invalid)
    code = re.sub(r'(\])\s*:', r'\1;', code)
    code = re.sub(r'(\))\s*:', r'\1;', code)

    # 5c. Strip standalone style/class/linkStyle directive lines
    code = re.sub(r'^\s*style\s+\w+\s+.*$', '', code, flags=re.MULTILINE)
    code = re.sub(r'^\s*classDef\s+.*$', '', code, flags=re.MULTILINE)
    code = re.sub(r'^\s*linkStyle\s+.*$', '', code, flags=re.MULTILINE)

    # 5d. Replace Unicode dashes (em-dash, en-dash) with plain dashes
    code = code.replace('\u2014', '-').replace('\u2013', '-')

    # 6. Remove empty lines and trim whitespace
    lines = [l.rstrip() for l in code.strip().split('\n') if l.strip()]

    # 7. Ensure the code starts with a valid graph declaration
    if lines and not re.match(r'^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|pie|gantt)', lines[0].strip()):
        lines.insert(0, 'graph TD')

    # 8. Fix labels: remove problematic special characters inside node labels
    sanitized_lines = []
    for line in lines:
        # Remove embedded quotes inside bracket labels
        line = re.sub(r'\[([^\]]*?)"([^\]]*?)"([^\]]*?)\]', r'[\1\2\3]', line)
        # Replace pipe chars in labels (breaks mermaid table syntax)
        line = re.sub(r'\[([^\]]*)\|([^\]]*)\]', r'[\1 - \2]', line)
        # CRITICAL: Escape parentheses inside square-bracket labels.
        # Mermaid interprets (...) as round-node syntax, so A[Label (FAISS)] breaks.
        # Convert to A[Label - FAISS] instead.
        def _fix_parens_in_brackets(m):
            content = m.group(1)
            content = content.replace('(', '- ').replace(')', '')
            # Clean up double spaces
            content = re.sub(r'\s+', ' ', content).strip()
            return f'[{content}]'
        line = re.sub(r'\[([^\]]*\([^\]]*)\]', _fix_parens_in_brackets, line)
        # CRITICAL: Replace & with 'and' inside labels (& is HTML entity prefix in Mermaid)
        def _fix_ampersand_in_brackets(m):
            content = m.group(1).replace('&', 'and')
            return f'[{content}]'
        line = re.sub(r'\[([^\]]*&[^\]]*)\]', _fix_ampersand_in_brackets, line)
        sanitized_lines.append(line)

    result = '\n'.join(sanitized_lines)
    logger.info(f"Sanitized mermaid code ({len(lines)} lines)")
    return result


def _simplify_mermaid_code(code):
    """
    Aggressively simplify mermaid code for retry after 400 error.
    Strips subgraphs, styling, and class definitions — keeps only nodes + edges.
    """
    lines = code.strip().split('\n')
    simplified = []
    in_subgraph = False

    for line in lines:
        stripped = line.strip()
        # Keep graph declaration
        if re.match(r'^(graph|flowchart)', stripped):
            simplified.append(stripped)
            continue
        # Strip subgraph wrappers (keep contents)
        if stripped.startswith('subgraph'):
            in_subgraph = True
            continue
        if stripped == 'end' and in_subgraph:
            in_subgraph = False
            continue
        # Strip style/class directives
        if re.match(r'^(style|classDef|class |click |linkStyle)', stripped):
            continue
        # Keep node/edge definitions
        if '-->' in stripped or '---' in stripped or re.match(r'^\s*\w+[\[\(\{]', stripped):
            simplified.append(stripped)

    if len(simplified) < 2:
        # Fallback: can't simplify further
        return code

    return '\n'.join(simplified)


def _try_render_mermaid(mermaid_code):
    """
    Attempt to render mermaid code via mermaid.ink.
    Returns (success: bool, img_bytes: bytes | None).
    """
    import base64
    graphbytes = mermaid_code.encode("utf8")
    base64_bytes = base64.urlsafe_b64encode(graphbytes)
    base64_string = base64_bytes.decode("ascii")

    url = f"https://mermaid.ink/img/{base64_string}"
    logger.info(f"Requesting Mermaid Image: {url[:80]}...")

    response = requests.get(url, timeout=30)
    if response.status_code == 200:
        return True, response.content
    else:
        logger.warning(f"Mermaid.ink returned {response.status_code}")
        return False, None


def _render_mermaid_diagram(slide, spec):
    """
    Renders the diagram using Mermaid.ink API with sanitization + retry.
    Pipeline: raw code → sanitize → render → (on 400) simplify → retry.
    """
    mermaid_code = spec.get("mermaid_code", "")
    if not mermaid_code:
        logger.warning("No mermaid_code provided.")
        return

    try:
        import uuid
        import os

        # Step 1: Sanitize
        clean_code = _sanitize_mermaid_code(mermaid_code)
        logger.info(f"Sanitized mermaid:\n{clean_code[:200]}")

        # Step 2: Try rendering
        success, img_bytes = _try_render_mermaid(clean_code)

        # Step 3: If failed, simplify and retry
        if not success:
            logger.warning("First render failed. Simplifying and retrying...")
            simplified = _simplify_mermaid_code(clean_code)
            logger.info(f"Simplified mermaid:\n{simplified[:200]}")
            success, img_bytes = _try_render_mermaid(simplified)

        if not success or not img_bytes:
            logger.error("Mermaid rendering failed after retry. Diagram slide will be empty.")
            return

        image_stream = io.BytesIO(img_bytes)

        # Save to disk for high-res linking
        filename = f"diagram_{uuid.uuid4().hex[:8]}.png"
        scratch_dir = os.path.join(os.getcwd(), "scratch", "assets")
        os.makedirs(scratch_dir, exist_ok=True)
        file_path = os.path.join(scratch_dir, filename)
        with open(file_path, "wb") as f:
            f.write(img_bytes)

        # Add picture to slide (centered, max width 8")
        slide.shapes.add_picture(image_stream, Inches(1), Inches(1.5), width=Inches(8))

        # Add clickable link for zooming
        txBox = slide.shapes.add_textbox(Inches(1), Inches(6.8), Inches(8), Inches(0.5))
        tf = txBox.text_frame
        p = tf.add_paragraph()
        p.text = "🔍 Click here to view High-Resolution Diagram"
        p.runs[0].font.size = Pt(14)
        p.runs[0].hyperlink.address = f"file:///{file_path.replace(chr(92), '/')}"

        logger.info(f"Mermaid diagram rendered successfully. Saved to {file_path}")
    except Exception as e:
        logger.error(f"Mermaid exception: {e}")

def render_diagram_slide(prs, slide_data, api_key=None):
    """
    Creates a new slide for the diagram and applies the selected render mode.
    """
    layout_idx = 5  # Title Only layout is usually index 5 in standard templates
    if layout_idx >= len(prs.slide_layouts):
        layout_idx = 0
        
    slide_layout = prs.slide_layouts[layout_idx]
    slide = prs.slides.add_slide(slide_layout)
    
    # Set Title
    if hasattr(slide.shapes, "title") and slide.shapes.title:
        slide.shapes.title.text = slide_data.get("title", "System Architecture")
        
    diagram_info = slide_data.get("diagram", {})
    render_mode = diagram_info.get("render_mode", "programmatic")
    spec = diagram_info.get("spec", {})
    
    if render_mode == "mermaid":
        _render_mermaid_diagram(slide, spec)
    elif render_mode == "flux":
        _render_flux_diagram(slide, spec, api_key)
    else:
        _render_programmatic_diagram(slide, spec)
