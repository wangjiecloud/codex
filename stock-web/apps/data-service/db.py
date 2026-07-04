from sqlalchemy import (
    create_engine,
    Column,
    String,
    Float,
    Integer,
    Numeric,
    Text,
    DateTime,
    UniqueConstraint,
    text,
)

_P = Numeric(18, 4, asdecimal=False)
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./stock_data.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 60},
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

from sqlalchemy import event


@event.listens_for(engine, "connect")
def set_wal_mode(dbapi_conn, connection_record):
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    dbapi_conn.execute("PRAGMA synchronous=NORMAL")
    dbapi_conn.execute("PRAGMA busy_timeout=60000")
    dbapi_conn.execute("PRAGMA cache_size=-64000")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class StockMeta(Base):
    __tablename__ = "stock_meta"
    code = Column(String(10), primary_key=True)
    name = Column(String(50))
    market = Column(String(10))
    industry_ids = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockQuote(Base):
    __tablename__ = "stock_quote"
    code = Column(String(10), primary_key=True)
    name = Column(String(50))
    price = Column(_P)
    change = Column(_P)
    change_amt = Column(_P)
    open = Column(_P)
    prev_close = Column(_P)
    high = Column(_P)
    low = Column(_P)
    volume = Column(Float)
    turnover = Column(Float)
    market_cap = Column(_P)
    pe = Column(_P)
    pb = Column(_P)
    turnover_rate = Column(_P)
    amplitude = Column(_P)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockKline(Base):
    __tablename__ = "stock_kline"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)
    period = Column(String(10))
    trade_date = Column(String(10))
    open = Column(_P)
    high = Column(_P)
    low = Column(_P)
    close = Column(_P)
    volume = Column(Integer)
    turnover = Column(Float)
    change_pct = Column(_P)
    turn_rate = Column(_P)
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "period", "trade_date"),)


class StockFundamental(Base):
    __tablename__ = "stock_fundamental"
    code = Column(String(10), primary_key=True)
    report_date = Column(String(20))
    eps = Column(Float)
    roe = Column(Float)
    revenue = Column(Float)
    revenue_yoy = Column(Float)
    net_profit = Column(Float)
    net_profit_yoy = Column(Float)
    gross_margin = Column(Float)
    debt_ratio = Column(Float)
    raw_json = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockNews(Base):
    __tablename__ = "stock_news"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(20), index=True)
    title = Column(Text)
    url = Column(Text)
    source = Column(String(50))
    pub_time = Column(String(30))
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "url"),)


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
    """产业元信息：title / subtitle / layerLabels / sort_order"""

    __tablename__ = "industry_meta"
    industry_id = Column(String(30), primary_key=True)
    title = Column(String(100))
    subtitle = Column(Text)
    layer_labels = Column(Text, default="[]")  # JSON list
    sort_order = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)


class IndustryList(Base):
    """产业列表页卡片数据"""

    __tablename__ = "industry_list"
    industry_id = Column(String(30), primary_key=True)
    name = Column(String(100))
    description = Column(Text)
    icon = Column(String(20), default="cpu")
    company_count = Column(Integer, default=0)
    last_analyzed = Column(String(20), default="未分析")
    representatives = Column(Text, default="[]")  # JSON list of company names
    sort_order = Column(Integer, default=0)
    tab = Column(String(20), default="ai_infra")  # "ai_infra" | "company"
    updated_at = Column(DateTime, default=datetime.utcnow)


class NewsFlash(Base):
    __tablename__ = "news_flash"
    id = Column(String(50), primary_key=True)
    seq = Column(String(30), index=True, default="")
    title = Column(Text)
    digest = Column(Text, default="")
    url = Column(Text, default="")
    ctime = Column(String(30))
    category = Column(String(20), index=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ConceptBoard(Base):
    __tablename__ = "concept_board"
    code = Column(String(20), primary_key=True)
    name = Column(String(100))
    change_pct = Column(_P)
    change_amt = Column(_P)
    price = Column(_P)
    volume = Column(Float)
    turnover = Column(Float)
    rise_count = Column(Integer, default=0)
    fall_count = Column(Integer, default=0)
    lead_stock = Column(String(50), default="")
    lead_stock_pct = Column(_P, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GlobalMarketIndex(Base):
    """全球主要市场指数快照"""

    __tablename__ = "global_market_index"
    code = Column(String(20), primary_key=True)
    name = Column(String(100))
    region = Column(String(20))
    price = Column(_P)
    change_amt = Column(_P)
    change_pct = Column(_P)
    open = Column(_P)
    high = Column(_P)
    low = Column(_P)
    prev_close = Column(_P)
    market_time = Column(String(30))
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PortfolioHolding(Base):
    __tablename__ = "portfolio_holding"
    id = Column(String(50), primary_key=True)
    code = Column(String(10), index=True)
    name = Column(String(50))
    cost_price = Column(_P)
    shares = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PortfolioTrade(Base):
    __tablename__ = "portfolio_trade"
    id = Column(String(50), primary_key=True)
    holding_id = Column(String(50), index=True)
    trade_type = Column(String(10))
    trade_date = Column(String(20))
    price = Column(_P)
    shares = Column(Integer)
    note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class SwIndustry(Base):
    __tablename__ = "sw_industry"
    code = Column(String(20), primary_key=True)
    name = Column(String(100))
    level = Column(String(10), default="二级")
    prev_close = Column(_P, default=0.0)
    open = Column(_P, default=0.0)
    price = Column(_P, default=0.0)
    high = Column(_P, default=0.0)
    low = Column(_P, default=0.0)
    volume = Column(Float, default=0.0)
    turnover = Column(Float, default=0.0)
    change_pct = Column(_P, default=0.0)
    pe_static = Column(_P, default=0.0)
    pe_ttm = Column(_P, default=0.0)
    pb = Column(_P, default=0.0)
    dividend_yield = Column(_P, default=0.0)
    comp_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SwIndustryConstituent(Base):
    __tablename__ = "sw_industry_constituent"
    id = Column(Integer, primary_key=True, autoincrement=True)
    board_code = Column(String(20), index=True)
    stock_code = Column(String(10), index=True)
    stock_name = Column(String(50))
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("board_code", "stock_code"),)


class ThemeNews(Base):
    """板块/主题新闻条目，来自同花顺各热门主题的新闻列表"""

    __tablename__ = "theme_news"
    id = Column(String(80), primary_key=True)   # f"{theme_id}_{item_id}"
    theme_id = Column(String(50), index=True)
    theme_name = Column(String(100), default="")
    title = Column(Text, default="")
    source = Column(String(50), default="")
    pub_time = Column(String(30), index=True)    # 原始 Unix 时间戳转成字符串
    url = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow)


class FundFlowSnapshot(Base):
    """板块主力资金流向每日快照（同花顺概念/行业）"""

    __tablename__ = "fund_flow_snapshot"
    id = Column(Integer, primary_key=True, autoincrement=True)
    trade_date = Column(String(10), index=True)   # YYYY-MM-DD
    board_type = Column(String(10))               # concept | industry
    name = Column(String(100))
    index_val = Column(Float, default=0.0)
    change_pct = Column(Float, default=0.0)
    inflow = Column(Float, default=0.0)
    outflow = Column(Float, default=0.0)
    netflow = Column(Float, default=0.0)
    comp_count = Column(Integer, default=0)
    top_stock = Column(String(50), default="")
    top_stock_change_pct = Column(Float, default=0.0)
    top_stock_price = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("trade_date", "board_type", "name"),)


class StockGuba(Base):
    """股吧资讯与公告，来自东方财富股吧"""

    __tablename__ = "stock_guba"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)
    post_type = Column(String(10), index=True)  # "news" 资讯 | "notice" 公告
    title = Column(Text, default="")
    url = Column(Text, default="")
    author = Column(String(100), default="")
    read_count = Column(Integer, default=0)
    reply_count = Column(Integer, default=0)
    pub_time = Column(String(30), index=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "post_type", "url"),)


class StockRelation(Base):
    """股票共现关联关系（来自股吧帖子正文分析）"""

    __tablename__ = "stock_relation"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code_a = Column(String(10), index=True)   # 主体股票（被分析的股票）
    code_b = Column(String(10), index=True)   # 被关联股票
    count = Column(Integer, default=0)        # 共现次数
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code_a", "code_b"),)


class StockGubaPost(Base):
    """股吧帖子正文（关联分析用，全量落库）"""

    __tablename__ = "stock_guba_post"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)         # 所属股票代码
    post_id = Column(String(30), index=True)      # 帖子 ID
    title = Column(Text, default="")              # 标题
    content = Column(Text, default="")            # 正文 HTML
    pub_time = Column(String(30), index=True)     # 发布时间
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "post_id"),)


class StockGubaSync(Base):
    """股吧帖子同步状态（每只股票一条记录，done=True 表示已全量抓取完毕）"""

    __tablename__ = "stock_guba_sync"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), unique=True, index=True)
    done = Column(Integer, default=0)             # 0=未完成 1=已完成
    post_count = Column(Integer, default=0)       # 实际抓取帖子数
    relation_count = Column(Integer, default=0)   # 发现的关联股票数
    finished_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        nf_cols = {
            row[1] for row in conn.execute(text("PRAGMA table_info(news_flash)"))
        }
        if "seq" not in nf_cols:
            conn.execute(
                text("ALTER TABLE news_flash ADD COLUMN seq VARCHAR(30) DEFAULT ''")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_news_flash_seq ON news_flash (seq)")
            )
            conn.commit()

        il_cols = {
            row[1] for row in conn.execute(text("PRAGMA table_info(industry_list)"))
        }
        if "tab" not in il_cols:
            conn.execute(
                text(
                    "ALTER TABLE industry_list ADD COLUMN tab VARCHAR(20) DEFAULT 'ai_infra'"
                )
            )
            conn.commit()
