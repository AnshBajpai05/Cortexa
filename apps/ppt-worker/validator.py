class ValidationError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.errors = errors or []

def validate_presentation(data):
    """
    Strict validation of the presentation data.
    Raises ValidationError if requirements aren't met.
    """
    errors = []

    # Slide count >= 3
    if len(data.get("slides", [])) < 3:
        errors.append("Presentation must have at least 3 slides.")

    # Check for empty slides or missing titles
    for i, slide in enumerate(data.get("slides", [])):
        if not slide.get("title"):
            errors.append(f"Slide {i+1} is missing a title.")
        
        if not slide.get("bullets") and slide.get("type") == "bullets":
            errors.append(f"Slide {i+1} ('{slide.get('title')}') has no content.")

    if errors:
        raise ValidationError("JSON Validation Failed", errors=errors)
    
    return True
