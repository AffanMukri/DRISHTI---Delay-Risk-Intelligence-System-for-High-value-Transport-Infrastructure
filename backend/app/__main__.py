import uvicorn

from app.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=settings.backend_reload,
        loop="app.loop:compatible_loop_factory",
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()

