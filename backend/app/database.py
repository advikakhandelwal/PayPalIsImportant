import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Database URL configuration (defaults to SQLite local database file)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./trustpay.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite requires check_same_thread=False and generous timeout for concurrent FastAPI workers.
# For PostgreSQL / MySQL, connect_args remains empty and pool_pre_ping prevents stale sockets.
is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = (
    {"check_same_thread": False, "timeout": 30}
    if is_sqlite
    else {}
)

# 1. Create the SQLAlchemy Engine
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=not is_sqlite,
    echo=False,
)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _configure_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA busy_timeout=15000;")
        cursor.close()

# 2. Create the SessionLocal factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# 3. Create the Declarative Base class
Base = declarative_base()


# 4. Dependency helper for FastAPI routes
def get_db():
    """
    FastAPI dependency that provides a transactional database session per request.
    Ensures the session is cleanly closed after the request is finished.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

