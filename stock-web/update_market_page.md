# 前端页面更新说明

## 需要修改的内容

### 1. 添加期货持仓数据类型定义（在文件顶部类型定义区域）

```typescript
interface FuturesPosition {
  date: string;
  longPosition: number;
  shortPosition: number;
  netPosition: number;
}
```

### 2. 在 MarketPage 组件中添加状态

在 `export default function MarketPage()` 函数内部，添加：

```typescript
const [futuresData, setFuturesData] = useState<FuturesPosition[]>([]);
const [futuresLoading, setFuturesLoading] = useState(false);
```

### 3. 添加获取期货数据的函数

```typescript
const fetchFuturesPosition = async () => {
  setFuturesLoading(true);
  try {
    // 获取最近5个交易日的数据
    const dates = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0].replace(/-/g, ""));
    }

    const results = [];
    for (const date of dates) {
      try {
        const res = await fetch(
          `${API_BASE}/api/market-flow/futures/citic?date=${date}&variety=IF`,
        );
        if (res.ok) {
          const data = await res.json();
          results.push({
            date:
              data.date.slice(0, 4) +
              "-" +
              data.date.slice(4, 6) +
              "-" +
              data.date.slice(6, 8),
            longPosition: data.total_long,
            shortPosition: data.total_short,
            netPosition: data.net_position,
          });
        }
      } catch (e) {
        // 跳过获取失败的日期
      }
      if (results.length >= 5) break;
    }

    setFuturesData(results);
  } catch (e) {
    console.error("Failed to fetch futures data:", e);
  } finally {
    setFuturesLoading(false);
  }
};
```

### 4. 在 useEffect 中添加期货数据获取

```typescript
useEffect(() => {
  fetchMarketSummary();
  fetchIndustryData();
  fetchConceptData();
  fetchFuturesPosition(); // 添加这一行
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedDate]);
```

### 5. 修改 FuturesPositionPanel 组件

将：

```typescript
function FuturesPositionPanel() {
  const mockData = [...]
  return <div>...</div>
}
```

改为：

```typescript
function FuturesPositionPanel({
  data,
  loading,
}: {
  data: FuturesPosition[];
  loading: boolean;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <div className="text-[#f5a623]">
            <Target size={18} />
          </div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            中信证券股指期货持仓 (IF主力合约)
          </h3>
        </div>
      </div>

      <div className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] text-[var(--text-tertiary)] border-b border-[var(--border-color)]">
                <th className="px-3 py-3 text-left font-medium">日期</th>
                <th className="px-3 py-3 text-right font-medium">多单</th>
                <th className="px-3 py-3 text-right font-medium">空单</th>
                <th className="px-3 py-3 text-right font-medium">净持仓</th>
                <th className="px-3 py-3 text-right font-medium">多空比</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-[var(--text-tertiary)]">
                      <RefreshCw size={16} className="animate-spin" />
                      <span className="text-sm">加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <span className="text-sm text-[var(--text-tertiary)]">暂无数据</span>
                  </td>
                </tr>
              ) : (
                data.map((item, idx) => {
                  const ratio = item.shortPosition > 0 ? (item.longPosition / item.shortPosition).toFixed(2) : '--';
                  const netPositive = item.netPosition > 0;
                  return (
                    <tr
                      key={idx}
                      className="border-t border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-3 py-3 text-sm text-[var(--text-secondary)] tabular-nums">
                        {item.date}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-[#e84444] font-medium tabular-nums">
                        {item.longPosition.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-[#09d464] font-medium tabular-nums">
                        {item.shortPosition.toLocaleString()}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-3 text-sm text-right font-bold tabular-nums',
                          netPositive ? 'text-[#e84444]' : 'text-[#09d464]'
                        )}
                      >
                        {netPositive ? '+' : ''}
                        {item.netPosition.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-[var(--text-primary)] tabular-nums">
                        {ratio}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

### 6. 修改组件调用

将：

```typescript
<FuturesPositionPanel />
```

改为：

```typescript
<FuturesPositionPanel data={futuresData} loading={futuresLoading} />
```

## 修改总结

1. ✅ 移除了mock数据
2. ✅ 添加了真实API数据获取
3. ✅ 添加了loading状态
4. ✅ 移除了"模拟数据"标签
5. ✅ 标题更新为"IF主力合约"
