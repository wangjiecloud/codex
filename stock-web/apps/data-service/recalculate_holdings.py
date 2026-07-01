"""
一次性脚本：重新计算所有持仓的成本和数量
执行方式：python recalculate_holdings.py
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db import PortfolioHolding, PortfolioTrade
from datetime import datetime

DATABASE_URL = "sqlite:///./stock_data.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def recalculate_holding(holding, db):
    """根据交易记录重新计算持仓"""
    trades = (
        db.query(PortfolioTrade)
        .filter(PortfolioTrade.holding_id == holding.id)
        .order_by(PortfolioTrade.trade_date, PortfolioTrade.created_at)
        .all()
    )

    if not trades:
        print(f"  ⚠️  {holding.name} ({holding.code}): 无交易记录，跳过")
        return

    total_shares = 0
    total_cost = 0.0

    for trade in trades:
        if trade.trade_type == "buy":
            if trade.price > 0:
                total_cost += trade.price * trade.shares
            total_shares += trade.shares
        elif trade.trade_type == "sell" and total_shares > 0:
            total_cost -= trade.price * trade.shares
            total_shares -= trade.shares
            if total_shares <= 0:
                total_cost = 0.0

    old_cost = holding.cost_price
    old_shares = holding.shares

    holding.shares = max(0, total_shares)
    holding.cost_price = (
        round(total_cost / total_shares, 4) if total_shares > 0 else 0.0
    )
    holding.updated_at = datetime.utcnow()

    if old_cost != holding.cost_price or old_shares != holding.shares:
        print(f"  ✅ {holding.name} ({holding.code}):")
        print(f"     持仓: {old_shares} → {holding.shares}")
        print(f"     成本: {old_cost:.4f} → {holding.cost_price:.4f}")
    else:
        print(f"  ✓  {holding.name} ({holding.code}): 数据正确，无需更新")


def main():
    db = SessionLocal()
    try:
        holdings = db.query(PortfolioHolding).all()
        print(f"\n开始重新计算 {len(holdings)} 个持仓...\n")

        for holding in holdings:
            recalculate_holding(holding, db)

        db.commit()
        print(f"\n✅ 完成！所有持仓已重新计算\n")

    except Exception as e:
        db.rollback()
        print(f"\n❌ 错误: {e}\n")
    finally:
        db.close()


if __name__ == "__main__":
    main()
