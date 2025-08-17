from __future__ import annotations
from typing import Optional
from .config import get_settings

def init_otel_if_enabled() -> Optional[object]:
    """Initialize OpenTelemetry tracing if enabled and minimally configured.
    Returns a handle/object to keep references alive if needed.
    """
    settings = get_settings()
    if not settings.OTEL_ENABLED or not settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        return None
    try:
        # Lazy imports to avoid dependency if unused
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        resource = Resource.create({"service.name": settings.OTEL_SERVICE_NAME})
        provider = TracerProvider(resource=resource)
        trace.set_tracer_provider(provider)
        exporter = OTLPSpanExporter(endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT)
        provider.add_span_processor(BatchSpanProcessor(exporter))

        # Instrument frameworks
        FastAPIInstrumentor().instrument()
        HTTPXClientInstrumentor().instrument()
        return provider
    except Exception:
        return None


