# Stock Analyzer 前端功能测试指南

## 新增功能清单

### 1. K线图表组件 (StockChart.jsx)
- ✅ ECharts 集成
- ✅ 支持日K/周K/月K切换
- ✅ MA均线显示 (MA5/MA10/MA20/MA60)
- ✅ 成交量显示
- ✅ 数据缩放和拖拽
- ✅ 全屏查看功能
- ✅ 响应式设计

### 2. 自选股功能 (Watchlist.jsx)
- ✅ localStorage 本地存储
- ✅ 自选股列表管理
- ✅ 导入/导出功能
- ✅ 快速添加/移除按钮
- ✅ 实时价格更新
- ✅ WatchlistButton 组件供外部使用

### 3. 价格预警功能 (PriceAlert.jsx)
- ✅ 多类型预警 (价格/涨跌幅)
- ✅ 浏览器通知API集成
- ✅ 预警频率控制
- ✅ 预警状态管理
- ✅ QuickAlertButton 组件供外部使用

### 4. UI优化
- ✅ 股票搜索自动补全 (StockSearch.jsx)
- ✅ 表格列显示控制
- ✅ 本地搜索筛选
- ✅ 响应式布局适配
- ✅ 移动端抽屉导航

### 5. 路由和页面
- ✅ `/` - 市场概览
- ✅ `/analysis` - 智能选股
- ✅ `/watchlist` - 自选股管理
- ✅ `/alerts` - 价格预警
- ✅ `/strategy` - 策略配置
- ✅ `/stock/:symbol` - 股票详情

## 后端API接口要求

### 股票K线数据
```
GET /api/v1/stocks/:symbol/kline?period=day|week|month&limit=120
Response: {
  "symbol": "000001",
  "klines": [
    {
      "date": "2024-01-01",
      "open": 10.5,
      "close": 10.8,
      "high": 11.0,
      "low": 10.4,
      "volume": 1000000
    }
  ]
}
```

### 股票搜索
```
GET /api/v1/stocks/search?keyword=xxx&limit=10
Response: [
  { "symbol": "000001", "name": "平安银行", "change_percent": 2.5 }
]
```

### 股票行情
```
GET /api/v1/stocks/:symbol/quote
Response: {
  "symbol": "000001",
  "name": "平安银行",
  "price": 10.8,
  "change_percent": 2.5,
  "high": 11.0,
  "low": 10.4,
  "volume": 1000000
}
```

## 运行测试

```bash
cd /home/javid/.openclaw/workspace/stock-analyzer/frontend
npm start
```

访问 http://localhost:3000

## 注意事项

1. 确保浏览器允许通知权限以接收价格预警
2. 自选股数据存储在浏览器 localStorage 中
3. 移动端布局在屏幕宽度小于768px时自动切换