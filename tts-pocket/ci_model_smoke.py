from app.container import model_gateway
from app.models.gateway import PROVIDERS
from app.schemas import ModelGenerateRequest

assert "openrouter" in PROVIDERS

catalog = {item["key"]: item for item in model_gateway.catalog()}
assert "openrouter" in catalog
row = catalog["openrouter"]
assert row["provider"] == "OpenRouter"
assert row["configured"] is True
assert row["base_url"] == "https://openrouter.ai/api/v1"
assert row["default_model"] == "ci/test-model"

req = ModelGenerateRequest(
    provider="auto",
    prompt="connectivity test",
    privacy="cloud_ok",
    task_type="general",
)
assert model_gateway.route(req) == "openrouter"

print("OPENROUTER_MODEL_GATEWAY_OK")
