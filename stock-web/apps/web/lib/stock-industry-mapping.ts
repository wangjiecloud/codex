export const STOCK_INDUSTRY_MAP: Record<string, string> = {};

export function buildStockIndustryMapping(industryRegistry: any) {
  const mapping: Record<string, string> = {};
  
  Object.entries(industryRegistry).forEach(([industryId, industry]: [string, any]) => {
    if (!industry.nodes) return;
    
    industry.nodes.forEach((node: any) => {
      if (!node.data.stocks) return;
      
      node.data.stocks.forEach((stock: any) => {
        if (stock.code) {
          mapping[stock.code] = industryId;
        }
      });
    });
  });
  
  return mapping;
}
