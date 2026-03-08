FROM python:3.11-slim

WORKDIR /app

COPY FastAPI/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY FastAPI/ ./FastAPI/
COPY Front/ ./Front/

WORKDIR /app/FastAPI

CMD ["python", "replay_api.py"]
