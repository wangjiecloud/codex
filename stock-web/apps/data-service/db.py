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
    pool_size=5,        # 从10降到5，减少并发写冲突
    max_overflow=10,    # 从20降到10
    pool_pre_ping=True,
)

from sqlalchemy import event


@event.listens_for(engine, "connect")
def set_wal_mode(dbapi_conn, connection_record):
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    # FULL：每次commit都fsync，防止OS crash/进程kill时WAL损坏
    # 代价：写入略慢（约慢10-20%），但对低频批量写场景（K线/行情）完全可接受
    dbapi_conn.execute("PRAGMA synchronous=FULL")
    dbapi_conn.execute("PRAGMA busy_timeout=60000")
    dbapi_conn.execute("PRAGMA cache_size=-64000")
    # WAL文件超过64MB时自动触发checkpoint，防止WAL无限膨胀
    dbapi_conn.execute("PRAGMA wal_autocheckpoint=1000")


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


class StockF10Snapshot(Base):
    """东方财富 F10 主要指标快照（每次抓取覆盖最新一条）"""
    __tablename__ = "stock_f10_snapshot"
    code = Column(String(10), primary_key=True)
    # ---------- 基本每股指标 ----------
    eps_basic = Column(Float)           # 基本每股收益(元)
    eps_diluted = Column(Float)         # 稀释每股收益(元)
    eps_deducted = Column(Float)        # 扣非每股收益(元)
    nav_per_share = Column(Float)       # 每股净资产(元)
    reserve_per_share = Column(Float)   # 每股公积金(元)
    retained_per_share = Column(Float)  # 每股未分配利润(元)
    cfps = Column(Float)                # 每股经营现金流(元)
    # ---------- 估值指标 ----------
    pe_dynamic = Column(Float)          # 市盈率-动(倍)
    pe_ttm = Column(Float)              # 市盈率TTM(倍)
    pe_static = Column(Float)           # 市盈率-静(倍)
    pb = Column(Float)                  # 市净率(倍)
    total_shares = Column(Float)        # 总股本(万股)
    circulating_shares = Column(Float)  # 流通股本(万股)
    total_market_cap = Column(Float)    # 总市值(元)
    circulating_market_cap = Column(Float)  # 流通市值(元)
    # ---------- 成长能力指标 ----------
    revenue = Column(Float)             # 营业总收入(元)
    revenue_yoy = Column(Float)         # 营业总收入同比增长(%)
    revenue_qoq = Column(Float)         # 营业总收入滚动环比增长(%)
    gross_profit = Column(Float)        # 毛利润(元)
    net_profit = Column(Float)          # 归属净利润(元)
    net_profit_yoy = Column(Float)      # 归属净利润同比增长(%)
    net_profit_qoq = Column(Float)      # 归属净利润滚动环比增长(%)
    deducted_profit = Column(Float)     # 扣非净利润(元)
    deducted_profit_yoy = Column(Float) # 扣非净利润同比增长(%)
    deducted_profit_qoq = Column(Float) # 扣非净利润滚动环比增长(%)
    # ---------- 盈利能力指标 ----------
    roe_weighted = Column(Float)        # 净资产收益率(加权)(%)
    roe_deducted = Column(Float)        # 净资产收益率(扣非/加权)(%)
    roa_weighted = Column(Float)        # 总资产收益率(加权)(%)
    gross_margin = Column(Float)        # 毛利率(%)
    net_margin = Column(Float)          # 净利率(%)
    # ---------- 资产负债指标 ----------
    debt_ratio = Column(Float)          # 资产负债率(%)
    current_ratio = Column(Float)       # 流动比率
    quick_ratio = Column(Float)         # 速动比率
    # ---------- 运营效率指标 ----------
    inventory_turnover = Column(Float)  # 存货周转率
    ar_days = Column(Float)             # 应收账款周转天数
    # ---------- 收益质量指标 ----------
    prepaid_revenue_ratio = Column(Float)   # 预收账款/营业收入
    sales_cashflow_ratio = Column(Float)    # 销售净现金流/营业收入
    # ---------- 报告期及数据源信息 ----------
    report_period = Column(String(20))  # 最新报告期(如2026-03-31)
    data_source = Column(String(50), default="eastmoney_f10")
    source_url = Column(Text)           # 来源 URL
    raw_json = Column(Text)             # 原始数据 JSON 全量备份
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockF10FinancialHistory(Base):
    """东方财富 F10 财务历史数据（多报告期，按 code+report_date 唯一）"""
    __tablename__ = "stock_f10_financial_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)
    report_date = Column(String(20))      # 报告期 yyyy-MM-dd
    # 成长能力
    revenue = Column(Float)
    revenue_yoy = Column(Float)
    revenue_qoq = Column(Float)
    gross_profit = Column(Float)
    net_profit = Column(Float)
    net_profit_yoy = Column(Float)
    net_profit_qoq = Column(Float)
    deducted_profit = Column(Float)
    deducted_profit_yoy = Column(Float)
    # 每股指标
    eps_basic = Column(Float)
    eps_diluted = Column(Float)
    eps_deducted = Column(Float)
    nav_per_share = Column(Float)
    cfps = Column(Float)
    # 盈利能力
    roe_weighted = Column(Float)
    roa_weighted = Column(Float)
    gross_margin = Column(Float)
    net_margin = Column(Float)
    # 资产负债
    debt_ratio = Column(Float)
    current_ratio = Column(Float)
    quick_ratio = Column(Float)
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "report_date"),)


class StockF10DividendHistory(Base):
    """东方财富 F10 分红历史"""
    __tablename__ = "stock_f10_dividend_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)
    report_period = Column(String(20))    # 报告期(如2025年报)
    announce_date = Column(String(20))    # 公告日期
    dividend_plan = Column(String(100))   # 分红方案(如10派2.3元)
    record_date = Column(String(20))      # 股权登记日
    ex_div_date = Column(String(20))      # 除权除息日
    dividend_per_share = Column(Float)    # 每股股利(元,税前)
    status = Column(String(20))           # 方案进度
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "report_period"),)


class StockF10InstitutionForecast(Base):
    """东方财富 F10 机构盈利预测"""
    __tablename__ = "stock_f10_institution_forecast"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)
    institution = Column(String(100))     # 机构名称
    year = Column(String(10))             # 预测年份(如2026E)
    eps_forecast = Column(Float)          # 预测每股收益(元)
    pe_forecast = Column(Float)           # 对应市盈率
    net_profit_forecast = Column(Float)   # 预测净利润(元)
    revenue_forecast = Column(Float)      # 预测营收(元)
    rating = Column(String(20))           # 评级(买入/增持等)
    report_date = Column(String(20))      # 报告日期
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "institution", "year"),)


class StockF10BusinessAnalysis(Base):
    """东方财富 F10 经营分析（主营构成、研发、客户供应商等）"""
    __tablename__ = "stock_f10_business_analysis"
    code = Column(String(10), primary_key=True)
    report_date = Column(String(20))
    # 主营构成 JSON（按产品/行业/地区分类）
    main_business_breakdown = Column(Text)   # JSON
    # 研发投入
    rd_expense = Column(Float)               # 研发投入金额(元)
    rd_expense_ratio = Column(Float)         # 研发投入占营收比(%)
    # 员工竞争力
    employee_count = Column(Integer)
    revenue_per_employee = Column(Float)     # 人均营业总收入(万元)
    profit_per_employee = Column(Float)      # 人均净利润(万元)
    salary_per_employee = Column(Float)      # 人均薪酬(万元)
    # 前五大客户
    top5_customers = Column(Text)            # JSON
    top5_customers_ratio = Column(Float)     # 前五大客户销售占比(%)
    # 经营评述摘要
    business_review = Column(Text)
    core_competence = Column(Text)           # 核心竞争力描述
    industry_background = Column(Text)       # 行业背景描述
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockF10ShareholderInfo(Base):
    """东方财富 F10 股东研究快照"""
    __tablename__ = "stock_f10_shareholder_info"
    code = Column(String(10), primary_key=True)
    report_date = Column(String(20))
    total_shareholders = Column(Integer)       # 股东总户数
    avg_shares_per_holder = Column(Float)      # 户均持股(股)
    top10_holders = Column(Text)               # JSON 前十大股东
    top10_float_holders = Column(Text)         # JSON 前十大流通股东
    institutional_ratio = Column(Float)        # 机构持股比例(%)
    major_holder_change = Column(Text)         # 主要股东变化描述
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockF10FinancialStatement(Base):
    """东方财富 F10 财务三表详细科目（资产负债表/利润表/现金流量表）"""
    __tablename__ = "stock_f10_financial_statement"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)
    report_date = Column(String(20))          # 报告期 yyyy-MM-dd
    statement_type = Column(String(20))       # "balance_sheet" | "income" | "cashflow"
    tab_label = Column(String(20), default="按报告期")  # 按报告期/按单季度/同比/年报
    content_text = Column(Text)               # 原始文本内容（全量存储）
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "statement_type", "tab_label", "report_date"),)


class StockF10PeerComparison(Base):
    """东方财富 F10 同行比较数据"""
    __tablename__ = "stock_f10_peer_comparison"
    code = Column(String(10), primary_key=True)
    report_date = Column(String(20))
    content_text = Column(Text)               # 同行比较原始文本
    # 行业排名信息
    industry_name = Column(String(50))        # 所属申万行业
    industry_rank = Column(Integer)           # 行业排名
    industry_total = Column(Integer)          # 行业总公司数
    # 关键指标行业对比 JSON
    peer_metrics_json = Column(Text)          # {"roe_rank": 5, "gross_margin_rank": 3, ...}
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockF10CompanyProfile(Base):
    """东方财富 F10 公司概况 + 公司高管 + 股本结构"""
    __tablename__ = "stock_f10_company_profile"
    code = Column(String(10), primary_key=True)
    # 公司概况 gsgk
    company_name = Column(String(100))
    listed_date = Column(String(20))          # 上市日期
    registered_capital = Column(Float)       # 注册资本(万元)
    employees = Column(Integer)               # 员工人数
    business_scope = Column(Text)             # 经营范围
    main_business = Column(Text)              # 主营业务描述
    core_competence = Column(Text)            # 核心竞争力
    industry_background = Column(Text)        # 行业背景
    # 公司高管 gsgg
    executives_json = Column(Text)            # JSON 高管列表 [{name, title, salary}, ...]
    # 股本结构 gbjg
    share_structure_json = Column(Text)       # JSON 股本结构各期
    total_shares = Column(Float)              # 总股本(万股)
    float_a_shares = Column(Float)            # 流通A股(万股)
    restricted_shares = Column(Float)         # 限售股(万股)
    # 核心题材 hxtc
    concept_sectors = Column(Text)            # JSON 所属板块列表
    # 资本运作 zbyz
    capital_operations = Column(Text)         # 资本运作历史文本
    # 关联个股 glgg
    related_stocks_json = Column(Text)        # JSON 关联个股
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockF10KeyEvents(Base):
    """东方财富 F10 公司大事纪要"""
    __tablename__ = "stock_f10_key_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)
    event_date = Column(String(20))           # 事件日期
    event_type = Column(String(50))           # 事件类型（股东大会/增发/回购/调研等）
    event_desc = Column(Text)                 # 事件描述
    source_url = Column(Text)                 # 公告链接
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "event_date", "event_type"),)


class StockF10FundFlow(Base):
    """东方财富 F10 资金流向与龙虎榜"""
    __tablename__ = "stock_f10_fund_flow"
    code = Column(String(10), primary_key=True)
    # 资金流向 zjlx
    fund_flow_text = Column(Text)             # 资金流向原始文本
    margin_balance = Column(Float)            # 融资余额(元)
    margin_net_buy = Column(Float)            # 融资净买入额(元)
    # 龙虎榜 lhbd
    dragon_tiger_text = Column(Text)          # 龙虎榜原始文本
    last_dragon_date = Column(String(20))     # 最近一次上榜日期
    last_dragon_reason = Column(String(200))  # 上榜原因
    # 大宗交易摘要
    block_trade_text = Column(Text)           # 大宗交易文本
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockF10ResearchReport(Base):
    """东方财富 F10 研究报告摘要"""
    __tablename__ = "stock_f10_research_report"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)
    report_date = Column(String(20))          # 报告日期
    institution = Column(String(100))         # 机构名称
    rating = Column(String(20))               # 评级（买入/增持/推荐等）
    title = Column(Text)                      # 报告标题
    summary = Column(Text)                    # 报告摘要
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "report_date", "institution", "title"),)


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
    period = Column(String(10), default="today")  # today | 3d | 5d | 10d
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
    __table_args__ = (UniqueConstraint("trade_date", "board_type", "period", "name"),)


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


class MarketFundFlowSnapshot(Base):
    """市场资金流向每日快照（按投资者类型分类：机构/游资/散户/北向资金）"""

    __tablename__ = "market_fund_flow_snapshot"
    id = Column(Integer, primary_key=True, autoincrement=True)
    trade_date = Column(String(10), index=True)  # YYYY-MM-DD 交易日期
    investor_type = Column(String(20), index=True)  # north_bound | main | institution | hot_money | retail
    inflow = Column(Float, default=0.0)  # 流入金额（元）
    outflow = Column(Float, default=0.0)  # 流出金额（元）
    netflow = Column(Float, default=0.0)  # 净流入金额（元）
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("trade_date", "investor_type"),)


class FuturesPositionSnapshot(Base):
    """期货持仓快照（中信证券在股指期货主力合约的持仓）"""

    __tablename__ = "futures_position_snapshot"
    id = Column(Integer, primary_key=True, autoincrement=True)
    trade_date = Column(String(10), index=True)  # YYYYMMDD 交易日期
    variety = Column(String(10))  # IF | IH | IC | IM 期货品种
    contract = Column(String(20))  # 主力合约代码（如IF2609）
    broker = Column(String(50), default="中信")  # 期货公司（默认中信）
    long_position = Column(Integer, default=0)  # 多单持仓（手）
    short_position = Column(Integer, default=0)  # 空单持仓（手）
    net_position = Column(Integer, default=0)  # 净持仓（手，正数做多，负数做空）
    total_oi = Column(Integer, default=0)  # 该合约全市场总持仓（手）
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("trade_date", "variety", "broker"),)


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


class Memo(Base):
    """备忘录"""

    __tablename__ = "memo"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), default="")
    content = Column(Text, nullable=False, default="")
    pinned = Column(Integer, nullable=False, default=0)   # 1=置顶
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockMinuteKline(Base):
    """个股分时数据（每分钟 OHLCV，按 code+trade_date+minute_time 唯一）"""

    __tablename__ = "stock_minute_kline"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), index=True)        # 股票代码
    trade_date = Column(String(10), index=True)  # 交易日 "YYYY-MM-DD"
    minute_time = Column(String(5))              # 分钟时间 "HH:MM"（09:30~15:00）
    open = Column(_P)
    high = Column(_P)
    low = Column(_P)
    close = Column(_P)
    volume = Column(Float, default=0.0)          # 成交量（手）
    amount = Column(Float, default=0.0)          # 成交额（元）
    avg_price = Column(_P, default=0.0)          # 均价
    prev_close = Column(_P, default=0.0)         # 昨收（用于计算涨跌幅）
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "trade_date", "minute_time"),)


class GlobalIndexKline(Base):
    """全球主要指数 K 线历史数据（日/周/月）"""

    __tablename__ = "global_index_kline"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(20), index=True)        # 指数代码，如 HSI / NDX / N225
    period = Column(String(10))                  # "daily" | "weekly" | "monthly"
    trade_date = Column(String(10))              # "YYYY-MM-DD"
    open = Column(_P)
    high = Column(_P)
    low = Column(_P)
    close = Column(_P)
    volume = Column(Float, default=0.0)
    change_pct = Column(_P, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("code", "period", "trade_date"),)


class MarketBreadth(Base):
    """A股市场情绪/宽度统计（每日涨跌家数、涨跌停家数）"""

    __tablename__ = "market_breadth"
    id = Column(Integer, primary_key=True, autoincrement=True)
    trade_date = Column(String(10), unique=True, index=True)  # "YYYY-MM-DD"
    up_count = Column(Integer, default=0)       # 上涨家数
    down_count = Column(Integer, default=0)     # 下跌家数
    flat_count = Column(Integer, default=0)     # 平盘家数
    limit_up = Column(Integer, default=0)       # 涨停家数
    limit_down = Column(Integer, default=0)     # 跌停家数
    st_limit_up = Column(Integer, default=0)    # ST涨停（+5%）家数
    st_limit_down = Column(Integer, default=0)  # ST跌停（-5%）家数
    total = Column(Integer, default=0)          # 全市场参与计算总家数
    updated_at = Column(DateTime, default=datetime.utcnow)


class TaskLastRun(Base):
    """记录每个调度任务的上次完成时间（持久化，进程重启后不丢失）"""

    __tablename__ = "task_last_run"
    task_id = Column(String(100), primary_key=True)
    last_run_at = Column(DateTime, nullable=False)   # UTC 时间
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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

        ffs_cols = {
            row[1] for row in conn.execute(text("PRAGMA table_info(fund_flow_snapshot)"))
        }
        if "period" not in ffs_cols:
            # SQLite 不支持修改唯一约束，需重建表
            conn.execute(text("DROP INDEX IF EXISTS ix_fund_flow_snapshot_trade_date"))
            conn.execute(text("ALTER TABLE fund_flow_snapshot RENAME TO fund_flow_snapshot_old"))
            conn.execute(text("""
                CREATE TABLE fund_flow_snapshot (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    trade_date  VARCHAR(10),
                    board_type  VARCHAR(10),
                    period      VARCHAR(10) DEFAULT 'today',
                    name        VARCHAR(100),
                    index_val   FLOAT DEFAULT 0.0,
                    change_pct  FLOAT DEFAULT 0.0,
                    inflow      FLOAT DEFAULT 0.0,
                    outflow     FLOAT DEFAULT 0.0,
                    netflow     FLOAT DEFAULT 0.0,
                    comp_count  INTEGER DEFAULT 0,
                    top_stock   VARCHAR(50) DEFAULT '',
                    top_stock_change_pct FLOAT DEFAULT 0.0,
                    top_stock_price      FLOAT DEFAULT 0.0,
                    updated_at  DATETIME,
                    UNIQUE(trade_date, board_type, period, name)
                )
            """))
            conn.execute(text("""
                INSERT INTO fund_flow_snapshot
                    (trade_date, board_type, period, name,
                     index_val, change_pct, inflow, outflow, netflow,
                     comp_count, top_stock, top_stock_change_pct, top_stock_price, updated_at)
                SELECT
                    trade_date, board_type, 'today', name,
                    index_val, change_pct, inflow, outflow, netflow,
                    comp_count, top_stock, top_stock_change_pct, top_stock_price, updated_at
                FROM fund_flow_snapshot_old
            """))
            conn.execute(text(
                "CREATE INDEX ix_fund_flow_snapshot_trade_date ON fund_flow_snapshot (trade_date)"
            ))
            conn.execute(text("DROP TABLE fund_flow_snapshot_old"))
            conn.commit()

        # memo 表（备忘录，若不存在则建表）
        memo_tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
        if "memo" not in memo_tables:
            conn.execute(text("""
                CREATE TABLE memo (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    title     VARCHAR(200) DEFAULT '',
                    content   TEXT NOT NULL DEFAULT '',
                    pinned    INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
            """))
            conn.commit()

        # stock_fundamental 旧表字段补全（向下兼容）
        sf_cols = {
            row[1] for row in conn.execute(text("PRAGMA table_info(stock_fundamental)"))
        }
        for col_def in [
            ("net_margin", "FLOAT"),
            ("current_ratio", "FLOAT"),
            ("quick_ratio", "FLOAT"),
            ("inventory_turnover", "FLOAT"),
            ("ar_days", "FLOAT"),
        ]:
            if col_def[0] not in sf_cols:
                conn.execute(text(f"ALTER TABLE stock_fundamental ADD COLUMN {col_def[0]} {col_def[1]}"))
        conn.commit()
