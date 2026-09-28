import asyncio
import sys
from dotenv import load_dotenv
load_dotenv()

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.database import get_session_factory
from app.repositories.projects import ProjectRepository
from app.repositories.risks import RiskRepository
from app.repositories.predictions import PredictionRepository
from app.repositories.dependencies import DependencyRepository
from app.repositories.analytics import AnalyticsRepository
from app.repositories.interventions import InterventionRepository
from app.repositories.warnings import WarningRepository
from app.repositories.model_monitoring import ModelMonitoringRepository
from app.repositories.portfolio import PortfolioRepository
from sqlalchemy import text

async def main():
    factory = get_session_factory()
    user_id = '51f5a853-88ca-41db-a7f5-9a1d09292f93'
    async with factory() as session:
        async with session.begin():
            await session.execute(text("set local role authenticated"))
            await session.execute(
                text("select set_config('request.jwt.claim.sub', :u, true)"),
                {"u": user_id}
            )
            
            p_repo = ProjectRepository(session)
            projs, total = await p_repo.list(search=None, ministry=None, sector=None, status=None, limit=5, offset=0)
            print(f"[OK] Projects API: {total} total projects in database, {len(projs)} fetched")
            
            r_repo = RiskRepository(session)
            p_code, traj_points = await r_repo.trajectory_for_project("PRJ-001")
            print(f"[OK] Risk Trajectory API: {len(traj_points)} historical risk snapshots for {p_code}")
            
            pred_repo = PredictionRepository(session)
            _, cost_pred = await pred_repo.latest_cost_prediction("PRJ-001")
            print(f"[OK] Cost Prediction ML: Final cost = INR {cost_pred.get('predicted_final_cost'):,.0f} Cr (Escalation: {cost_pred.get('predicted_escalation_percentage')}%)")
            
            _, sched_pred = await pred_repo.latest_schedule_prediction("PRJ-001")
            print(f"[OK] Schedule Prediction ML: Delay = {sched_pred.get('predicted_completion_variance_days')} days, Target: {sched_pred.get('predicted_completion_date')}")
            
            dep_repo = DependencyRepository(session)
            p_dict = await dep_repo.project("PRJ-001")
            ms_nodes = await dep_repo.milestones(p_dict["id"])
            ms_edges = await dep_repo.edges(p_dict["id"])
            print(f"[OK] Dependency & Risk Propagation DAG: {len(ms_nodes)} Planning Nodes, {len(ms_edges)} Explicit Dependency Edges for PRJ-001")
            
            an_repo = AnalyticsRepository(session)
            cost_an = await an_repo.cost()
            print(f"[OK] Cost Analytics Forensics: Total cost = INR {cost_an['summary']['latest_revised_cost']:,.0f} Cr")
            sched_an = await an_repo.schedule()
            print(f"[OK] Schedule Analytics Slippage: Delayed = {sched_an['summary']['delayed_projects']}, Average slippage = {round(sched_an['summary']['average_slippage_days'])} days")
            from app.services.analytics import AnalyticsService
            an_svc = AnalyticsService(an_repo)
            bench_an = await an_svc.benchmark(project_id="PRJ-001", comparison_project_id=None, max_peers=5)
            print(f"[OK] Historical Peer Benchmarking: Selected = {bench_an['selected_project']['project_name']}, Evaluated candidates = {bench_an['peer_group']['candidate_projects_evaluated']}, Peers = {len(bench_an['peers'])}, Agency Leaderboard = {len(bench_an['agency_leaderboard'])}")
            
            int_repo = InterventionRepository(session)
            interventions = await int_repo.list(status=None, priority=None)
            print("[OK] Intervention Center: Count =", len(interventions))
            
            warn_repo = WarningRepository(session)
            warnings = await warn_repo.list(status=None, severity=None)
            print("[OK] Early Warning Center: Count =", len(warnings))
            
            mm_repo = ModelMonitoringRepository(session)
            mm_models = await mm_repo.models()
            print("[OK] Model Monitoring Inventory: Models =", len(mm_models))
            
            res = await session.execute(text("SELECT count(*) FROM public.notifications WHERE recipient_id = :u"), {"u": user_id})
            print("[OK] Notifications System: Alerts =", res.scalar())
            
            port_repo = PortfolioRepository(session)
            port_sum = await port_repo.summary()
            print(f"[OK] Portfolio Summary: Projects = {port_sum.get('total_projects')}, Portfolio Value = INR {port_sum.get('portfolio_value'):,.0f} Cr")
            comp_facts = await port_repo.comparison_facts()
            print(f"[OK] Portfolio Comparison Facts: Periods = {comp_facts.get('periods')}, Snapshots = {len(comp_facts.get('snapshots', []))}")

if __name__ == "__main__":
    asyncio.run(main())
