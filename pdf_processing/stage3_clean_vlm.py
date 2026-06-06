import re
from pathlib import Path
from pipeline.utils import setup_logger, RawPageRecord

logger = setup_logger("stage3_clean_vlm")

def clean_markdown_safe(pages: list[RawPageRecord], output_dir: Path, doc_id: str) -> Path:
    """
    Cleans VLM-generated Markdown while strictly preserving LaTeX equations.
    Also strips layout diagram noise such as chains of '+', '-', '='.
    """
    logger.info(f"Cleaning markdown for {len(pages)} pages of {doc_id}")
    
    cleaned_pages_text = []
    
    for page in pages:
        text = page.raw_text
        
        # 1. Protect math blocks during cleaning
        # We will temporarily extract $$...$$ and $...$ into placeholders
        math_blocks = []
        
        def block_replacer(match):
            math_blocks.append(match.group(0))
            return f"__MATH_BLOCK_{len(math_blocks)-1}__"
            
        def inline_replacer(match):
            math_blocks.append(match.group(0))
            return f"__MATH_INLINE_{len(math_blocks)-1}__"

        # Replace display math
        text_no_math = re.sub(r'\$\$.*?\$\$', block_replacer, text, flags=re.DOTALL)
        text_no_math = re.sub(r'\\\[.*?\\\]', block_replacer, text_no_math, flags=re.DOTALL)
        
        # Replace inline math
        text_no_math = re.sub(r'(?<!\$)\$(?!\$)(.*?)(?<!\$)\$(?!\$)', inline_replacer, text_no_math)
        
        # Remove unwanted layout diagram noise (chains of pure math operators floating around)
        noise_filtered_lines = []
        for line in text_no_math.split('\n'):
            if re.match(r'^[+\-=\s><]+$', line.strip()):
                continue # drop diagram noise
            noise_filtered_lines.append(line)
        cleaned_text = "\n".join(noise_filtered_lines)
        
        # Remove markdown image placeholders (noise)
        cleaned_text = re.sub(r'!\[\]\(_page_.*?\)', '', cleaned_text)
        
        # Clean inline HTML/formatting noise
        cleaned_text = re.sub(r'<[^>]+>', '', cleaned_text)
        
        # Clean specific OCR garbage string chains inside tables
        cleaned_text = re.sub(r'\b(der|tier|Owe|Course|Cite|Owne|Ouse)\b[^\|]*', '', cleaned_text, flags=re.IGNORECASE)
        
        # Remove large sequences of empty lines
        cleaned_text = re.sub(r'\n{3,}', '\n\n', cleaned_text)
        
        # Remove unwanted artifact lines created by VLM
        cleaned_text = re.sub(r'^\s*[-_]{5,}\s*$', '', cleaned_text, flags=re.MULTILINE)
        
        # 3. Restore math blocks
        for i, math_content in enumerate(math_blocks):
            cleaned_text = cleaned_text.replace(f"__MATH_BLOCK_{i}__", math_content)
            cleaned_text = cleaned_text.replace(f"__MATH_INLINE_{i}__", math_content)
            
        # Add explicit page boundary for downstream chunking
        cleaned_pages_text.append(f"<!-- PAGE_{page.page_num} -->\n{cleaned_text}")
    
    # Combine
    combined = "\n\n".join(cleaned_pages_text)
    
    out_path = output_dir / f"{doc_id}_clean.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(combined)
        
    logger.info(f"Successfully cleaned markdown to {out_path}")
    return out_path
