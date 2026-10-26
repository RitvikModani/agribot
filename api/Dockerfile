FROM python:3.11-slim

# Hugging Face Spaces run containers as uid 1000.
RUN useradd --create-home --uid 1000 agribot
WORKDIR /home/agribot/app

COPY --chown=agribot requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=agribot app ./app
COPY --chown=agribot model ./model

USER agribot
ENV PYTHONUNBUFFERED=1 MODEL_PATH=model/agribot_tomato_v1.onnx
EXPOSE 7860
# Render sets $PORT; Hugging Face Spaces expect 7860.
CMD ["sh", "-c", "exec uvicorn app.main:build_app --factory --host 0.0.0.0 --port ${PORT:-7860} --proxy-headers --forwarded-allow-ips='*'"]
