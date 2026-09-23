from typing import Any, Protocol


class ModelUnavailableError(RuntimeError):
    """Raised when an ML provider has not been configured or is unavailable."""


class ModelProvider(Protocol):
    async def predict(self, *, model_name: str, features: dict[str, Any]) -> dict[str, Any]:
        """Run a registered model. Implementations will be added separately."""
        ...

