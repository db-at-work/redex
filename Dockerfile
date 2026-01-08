# --- Stage 1: Build Frontend ---
FROM node:20-alpine AS build-stage
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build
# At this point, files ARE in /app/dist

# --- Stage 2: Python Backend ---
FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/main.py .

# Explicitly copy from the build-stage /app/dist folder
COPY --from=build-stage /app/dist ./static

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]