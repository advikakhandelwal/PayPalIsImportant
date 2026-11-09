import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Database URL configuration (defaults to SQLite local database file)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./trustpay.db")

# SQLite requires check_same_thread=False when used with multi-threaded frameworks like FastAPI.
# If later migrated to PostgreSQL, connect_args remains empty.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# 1. Create the SQLAlchemy Engine
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

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

