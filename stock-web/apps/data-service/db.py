from sqlalchemy import (
    create_engine,
    Column,
    String,
    Float,
    Integer,
    Text,
    DateTime,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./stock_data.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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
    price = Column(Float)
    change = Column(Float)
    change_amt = Column(Float)
    open = Column(Float)
    prev_close = Column(Float)
    high = Column(Float)
    low = Column(Float)
    volume = Column(Float)
    turnover = Column(Float)
    market_cap = Column(Float)
    pe = Column(Float)
    pb = Column(Float)
    turnover_rate = Column(Float)
    amplitude = Column(Float)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockKline(Base):
    __tablename__ = "stock_kline"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)
    period = Column(String(10))
    trade_date = Column(String(10))
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Integer)
    turnover = Column(Float)
    change_pct = Column(Float)
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


class GubaPost(Base):
    __tablename__ = "guba_post"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(20), index=True)
    post_id = Column(String(50))
    title = Column(Text)
    author = Column(String(100))
    read_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    post_time = Column(String(30))
    url = Column(Text)
    category = Column(String(20), index=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "post_id"),)


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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
