FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if any
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY apps/ppt-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# We mount the whole repo as a volume in docker-compose for dev,
# but for the build we can copy the specific app files
COPY apps/ppt-worker/ .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
