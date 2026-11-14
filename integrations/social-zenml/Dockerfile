FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd -m -u 10001 social
COPY pipelines.py worker.py ./
RUN mkdir -p /var/lib/social-zenml && chown social:social /var/lib/social-zenml
USER social
ENV ZENML_CONFIG_PATH=/var/lib/social-zenml/config ZENML_ANALYTICS_OPT_IN=false
CMD ["python", "worker.py"]
