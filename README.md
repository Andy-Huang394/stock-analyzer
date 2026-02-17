# A股量化分析平台 - Stock Analyzer

## 🎩 贾维斯出品

一个带有科幻风格界面的A股交易策略分析工具，支持实时数据获取、技术指标分析、策略回测优化。

## 功能特性

- 📊 定时获取A股全市场实时数据
- 🤖 多维度技术分析信号评分
- 🎯 策略参数自动回测优化
- 📈 按涨幅和上涨概率智能排序
- 🌌 科幻风格数据可视化界面

## 技术栈

- **后端:** Python + FastAPI + akshare + SQLite
- **前端:** React + TypeScript + ECharts
- **数据源:** akshare（免费A股数据）

## 快速开始

### 后端启动
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### 前端启动
```bash
cd frontend
npm install
npm start
```

## 项目结构

```
stock-analyzer/
├── backend/          # Python后端
│   ├── app/
│   │   ├── api/      # API路由
│   │   ├── data/     # 数据获取
│   │   ├── strategies/  # 策略引擎
│   │   └── backtest/    # 回测引擎
│   └── main.py
└── frontend/         # React前端
    └── src/
```

## License
MIT
