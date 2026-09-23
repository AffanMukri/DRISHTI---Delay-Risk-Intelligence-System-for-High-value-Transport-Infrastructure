from app.analytics.cycle_comparison import build_cycle_comparison
from app.config import Settings
from app.repositories.portfolio import PortfolioRepository


class PortfolioService:
    def __init__(self, repository: PortfolioRepository, settings: Settings) -> None:
        self.repository = repository
        self.settings = settings

    async def summary(self) -> dict[str, object]:
        return await self.repository.summary()

    async def changes(self) -> dict[str, object]:
        facts = await self.repository.comparison_facts()
        return build_cycle_comparison(
            facts,
            significant_increase=self.settings.comparison_significant_risk_increase_points,
            emerging_driver_increase=self.settings.risk_trajectory_stable_band_points,
        )
