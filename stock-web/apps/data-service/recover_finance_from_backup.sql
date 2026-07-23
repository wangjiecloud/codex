ATTACH 'backups/stock_data_20260715.db' AS bak;

INSERT INTO stock_kline (
  code, period, trade_date, open, high, low, close, volume, turnover, change_pct, turn_rate, updated_at
)
SELECT bk.code, bk.period, bk.trade_date, bk.open, bk.high, bk.low, bk.close, bk.volume, bk.turnover, bk.change_pct, bk.turn_rate, bk.updated_at
FROM bak.stock_kline bk
WHERE bk.period = 'daily'
  AND bk.code IN (
    '000001','002142','300033','300059','300085','300130','300248','300468','300531','300663','300674','300773',
    '600919','601166','601288','601398','601939','688318'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM stock_kline sk
    WHERE sk.code = bk.code
      AND sk.period = bk.period
      AND sk.trade_date = bk.trade_date
  );

INSERT INTO stock_fundamental (
  code, report_date, eps, roe, revenue, revenue_yoy, net_profit, net_profit_yoy, gross_margin, debt_ratio, raw_json, updated_at
)
SELECT bf.code, bf.report_date, bf.eps, bf.roe, bf.revenue, bf.revenue_yoy, bf.net_profit, bf.net_profit_yoy, bf.gross_margin, bf.debt_ratio, bf.raw_json, bf.updated_at
FROM bak.stock_fundamental bf
WHERE bf.code IN (
  '000001','002142','002537','300033','300059','300085','300130','300248','300468','300531','300663','300674','300773',
  '600030','600036','600570','600919','601066','601166','601211','601288','601318','601319','601336','601398',
  '601601','601628','601688','601901','601939','603106','688318'
)
  AND NOT EXISTS (
    SELECT 1
    FROM stock_fundamental sf
    WHERE sf.code = bf.code
  );

UPDATE stock_quote
SET
  name = COALESCE((SELECT bq.name FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), name),
  price = COALESCE((SELECT bq.price FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), price),
  change = COALESCE((SELECT bq.change FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), change),
  change_amt = COALESCE((SELECT bq.change_amt FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), change_amt),
  open = COALESCE((SELECT bq.open FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), open),
  prev_close = COALESCE((SELECT bq.prev_close FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), prev_close),
  high = COALESCE((SELECT bq.high FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), high),
  low = COALESCE((SELECT bq.low FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), low),
  volume = COALESCE((SELECT bq.volume FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), volume),
  turnover = COALESCE((SELECT bq.turnover FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), turnover),
  market_cap = COALESCE((SELECT bq.market_cap FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), market_cap),
  pe = COALESCE((SELECT bq.pe FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), pe),
  pb = COALESCE((SELECT bq.pb FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), pb),
  turnover_rate = COALESCE((SELECT bq.turnover_rate FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), turnover_rate),
  amplitude = COALESCE((SELECT bq.amplitude FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), amplitude),
  updated_at = COALESCE((SELECT bq.updated_at FROM bak.stock_quote bq WHERE bq.code = stock_quote.code), updated_at)
WHERE code IN (
  '002142','300085','300130','300248','300468','300531','300663','300674','300773',
  '600919','601166','601288','601398','601939','688318'
)
  AND IFNULL(price, 0) = 0
  AND updated_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM bak.stock_quote bq
    WHERE bq.code = stock_quote.code
      AND (IFNULL(bq.price, 0) > 0 OR bq.updated_at IS NOT NULL)
  );

DETACH bak;
