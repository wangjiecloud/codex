from sqlalchemy import (
    create_engine,
    Column,
    String,
    Float,
    Integer,
    Text,
    DateTime,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./stock_data.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 60},
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

from sqlalchemy import event


@event.listens_for(engine, "connect")
def set_wal_mode(dbapi_conn, connection_record):
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    dbapi_conn.execute("PRAGMA synchronous=NORMAL")
    dbapi_conn.execute("PRAGMA busy_timeout=60000")
    dbapi_conn.execute("PRAGMA cache_size=-64000")
    dbapi_conn.execute("PRAGMA wal_autocheckpoint=1000")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ============ 产业链图谱（结构性数据，需保留）============


class IndustryNode(Base):
    __tablename__ = "industry_node"
    industry_id = Column(String(30), primary_key=True)
    node_id = Column(String(60), primary_key=True)
    x = Column(Integer)
    y = Column(Integer)
    label = Column(String(100))
    icon = Column(String(10))
    desc = Column(Text)
    layer = Column(String(20))
    ticker = Column(String(20))
    market = Column(String(10))
    group_name = Column(String(50))
    stocks = Column(Text, default="[]")
    updated_at = Column(DateTime, default=datetime.utcnow)


class IndustryEdge(Base):
    __tablename__ = "industry_edge"
    industry_id = Column(String(30), primary_key=True)
    edge_id = Column(String(100), primary_key=True)
    source = Column(String(60))
    target = Column(String(60))
    layer = Column(String(20))
    label = Column(String(100))
    updated_at = Column(DateTime, default=datetime.utcnow)


class IndustryMeta(Base):
    __tablename__ = "industry_meta"
    industry_id = Column(String(30), primary_key=True)
    title = Column(String(100))
    subtitle = Column(Text)
    layer_labels = Column(Text, default="[]")
    sort_order = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)


class IndustryList(Base):
    __tablename__ = "industry_list"
    industry_id = Column(String(30), primary_key=True)
    name = Column(String(100))
    description = Column(Text)
    icon = Column(String(20), default="cpu")
    company_count = Column(Integer, default=0)
    last_analyzed = Column(String(20), default="未分析")
    representatives = Column(Text, default="[]")
    sort_order = Column(Integer, default=0)
    tab = Column(String(20), default="ai_infra")
    updated_at = Column(DateTime, default=datetime.utcnow)


# ============ 用户数据（需保留）============


class UserWatchlist(Base):
    __tablename__ = "user_watchlist"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(20), nullable=False, unique=True)
    sort_order = Column(Integer, nullable=False, default=0)
    added_at = Column(DateTime, default=datetime.utcnow)


class PortfolioHolding(Base):
    __tablename__ = "portfolio_holding"
    id = Column(String(50), primary_key=True)
    code = Column(String(10), index=True)
    name = Column(String(50))
    cost_price = Column(Float)
    shares = Column(Integer)
    closed_pnl_override = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PortfolioTrade(Base):
    __tablename__ = "portfolio_trade"
    id = Column(String(50), primary_key=True)
    holding_id = Column(String(50), index=True)
    trade_type = Column(String(10))
    trade_date = Column(String(20))
    price = Column(Float)
    shares = Column(Integer)
    note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Memo(Base):
    __tablename__ = "memo"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), default="")
    content = Column(Text, nullable=False, default="")
    pinned = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class XmindFile(Base):
    __tablename__ = "xmind_file"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class XmindNode(Base):
    __tablename__ = "xmind_node"
    id = Column(Integer, primary_key=True, autoincrement=True)
    file_id = Column(Integer, nullable=False, index=True)
    parent_id = Column(Integer, nullable=True, index=True)
    sheet_id = Column(String(100), nullable=False)
    sheet_title = Column(String(200), default="")
    title = Column(Text, nullable=False)
    content = Column(Text)
    url = Column(Text)
    node_order = Column(Integer, default=0)
    source_url = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 需要删除的股票数据表（不再存数据库，改为实时查询）
_DROPPED_TABLES = [
    "stock_meta",
    "stock_quote",
    "stock_kline",
    "stock_minute_kline",
    "stock_fundamental",
    "stock_indicator",
    "stock_news",
    "stock_f10_snapshot",
    "stock_f10_financial_history",
    "stock_f10_financial_statement",
    "stock_f10_dividend_history",
    "stock_f10_institution_forecast",
    "stock_f10_business_analysis",
    "stock_f10_shareholder_info",
    "stock_f10_peer_comparison",
    "stock_f10_company_profile",
    "stock_f10_key_events",
    "stock_f10_fund_flow",
    "stock_f10_research_report",
    "sw_industry",
    "sw_industry_daily",
    "sw_industry_constituent",
    "concept_board",
    "concept_board_constituent",
    "fund_flow_snapshot",
    "market_daily_fund_flow",
    "market_fund_flow_snapshot",
    "futures_position_snapshot",
    "margin_trading_daily",
    "margin_trading_stock_snapshot",
    "margin_trading_stock_history",
    "margin_trading_stock_sync_status",
    "news_flash",
    "theme_news",
    "stock_guba",
    "stock_guba_post",
    "stock_guba_sync",
    "global_market_index",
    "global_index_kline",
    "market_breadth",
    "stock_relation",
    "popular_stock_cache",
    "task_last_run",
]


def init_db():
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        existing_tables = {
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            )
        }

        for table_name in _DROPPED_TABLES:
            if table_name in existing_tables:
                conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
                print(f"[init_db] Dropped table: {table_name}")
        conn.commit()

        all_tables = {
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            )
        }

        if "memo" not in all_tables:
            conn.execute(
                text("""
                CREATE TABLE memo (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    title     VARCHAR(200) DEFAULT '',
                    content   TEXT NOT NULL DEFAULT '',
                    pinned    INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
            """)
            )
            conn.commit()

        if "user_watchlist" not in all_tables:
            conn.execute(
                text("""
                CREATE TABLE user_watchlist (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    code       VARCHAR(20) NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    added_at   DATETIME NOT NULL DEFAULT (datetime('now'))
                )
            """)
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_user_watchlist_sort ON user_watchlist (sort_order)"
                )
            )
            conn.commit()

        if "user_strategy" not in all_tables:
            conn.execute(
                text("""
                CREATE TABLE user_strategy (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    name         VARCHAR(100) NOT NULL,
                    description  TEXT,
                    for_code     VARCHAR(10),
                    for_name     VARCHAR(50),
                    sql_text     TEXT NOT NULL,
                    stop_profit  FLOAT DEFAULT 10.0,
                    stop_loss    FLOAT DEFAULT 6.0,
                    max_hold_days INTEGER DEFAULT 10,
                    win_rate     FLOAT,
                    avg_return   FLOAT,
                    trade_count  INTEGER,
                    score        FLOAT,
                    indicators   TEXT,
                    params_json  TEXT,
                    source       VARCHAR(20) DEFAULT 'auto',
                    created_at   DATETIME DEFAULT (datetime('now','localtime')),
                    updated_at   DATETIME DEFAULT (datetime('now','localtime'))
                )
            """)
            )
            conn.commit()

        if "xmind_file" not in all_tables:
            conn.execute(
                text("""
                CREATE TABLE xmind_file (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    name        VARCHAR(200) NOT NULL,
                    description TEXT,
                    created_at  DATETIME DEFAULT (datetime('now','localtime')),
                    updated_at  DATETIME DEFAULT (datetime('now','localtime'))
                )
            """)
            )
            conn.commit()

        if "xmind_node" not in all_tables:
            conn.execute(
                text("""
                CREATE TABLE xmind_node (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_id     INTEGER NOT NULL,
                    parent_id   INTEGER,
                    sheet_id    VARCHAR(100) NOT NULL,
                    sheet_title VARCHAR(200) DEFAULT '',
                    title       TEXT NOT NULL,
                    content     TEXT,
                    url         TEXT,
                    node_order  INTEGER DEFAULT 0,
                    source_url  TEXT,
                    created_at  DATETIME DEFAULT (datetime('now','localtime')),
                    FOREIGN KEY (file_id) REFERENCES xmind_file(id) ON DELETE CASCADE
                )
            """)
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_xmind_node_file ON xmind_node (file_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_xmind_node_sheet ON xmind_node (file_id, sheet_id)"
                )
            )
            conn.commit()
