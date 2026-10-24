# Stock Analyzer · A股量化分析平台

一个面向个人研究的 A 股分析工具：全市场数据抓取、技术指标评分、策略回测与参数优化、自选股与价格预警、K 线图表。

> ⚠️ 本项目仅用于学习与研究。回测结果不代表未来收益，评分/“上涨概率”不构成投资建议；不接入任何券商实盘接口。

## 功能

| 模块 | 说明 |
| --- | --- |
| 市场概览 | 涨跌分布、主要指数、成交额、资金流向、板块热度 |
| 智能选股 | RSI / MACD / 均线 / KDJ 等综合评分，多因子排序，定时全市场扫描（默认 Top 200） |
| 策略配置 | 指标参数与权重调整，网格搜索自动寻优 |
| 回测引擎 | 20+ 指标（夏普、索提诺、卡玛、最大回撤、VaR…），收益/回撤曲线、月度热力图、移动止损 |
| 自选股 | 增删改查、导入导出、价格预警、单股分析 |
| 数据管理 | SQLite（可选 MySQL/PostgreSQL）、CSV/Excel 导入导出、数据质量检查与修复 |
| K 线图表 | lightweight-charts，日/周/月 K、MA、成交量（`/chart/600519`） |
| 组合分析 | 组合分析与优化接口 |

## 技术栈

- **后端**：Python 3.12 · FastAPI · akshare · pandas · SQLAlchemy/SQLite · APScheduler · WebSocket
- **前端**：React 18 · Ant Design 5 · ECharts · lightweight-charts
- **数据源**：[akshare](https://github.com/akfamily/akshare)（免费，无需 API Key）

## 快速开始

环境：WSL / Linux / macOS，Python ≥ 3.10，Node.js ≥ 18。

### 一键启动

```bash
./start.sh        # 自动创建 backend/venv、安装依赖，并同时启动前后端
```

### 手动启动

```bash
# 后端（终端 1）
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py

# 前端（终端 2）
cd frontend
npm install
npm start
```

> 在 WSL 中使用 miniconda 时，可先 `export PATH="$HOME/miniconda3/bin:$PATH"`。

### 访问

| 服务 | 地址 |
| --- | --- |
| 前端界面 | http://localhost:3000 |
| API 文档（Swagger） | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/health |

首次启动会抓取并缓存行情数据（`backend/stock_cache.db`），需要几分钟。

## 项目结构

```
stock-analyzer/
├── backend/
│   ├── main.py              # FastAPI 入口 + 定时分析任务
│   ├── requirements.txt
│   └── app/
│       ├── api/             # routes.py（约 50 个 REST 接口）、websocket.py
│       ├── backtest/        # 回测引擎与指标
│       ├── strategies/      # 指标计算与评分策略
│       ├── data/            # 数据抓取、缓存、基本面、数据管理
│       ├── services/        # 业务服务
│       ├── models/          # Pydantic 模型、自选股模型
│       └── core/            # 配置
├── frontend/src/
│   ├── components/          # MarketOverview / StockChartPro / BacktestReport / Watchlist ...
│   └── App.jsx
├── start.sh                 # 一键启动
└── docs: GUIDE.md · PROGRESS.md · TEST_PLAN.md · QUALITY_REPORT.md ...
```

## 主要 API

| 分组 | 接口示例 |
| --- | --- |
| 行情 | `GET /market/overview` · `GET /stocks/{symbol}/kline` · `GET /stocks/{symbol}/fundamentals` |
| 分析 | `POST /analysis/run` · `GET /analysis/top` · `GET /analysis/multi-factor` |
| 策略/回测 | `GET/POST /strategy/params` · `POST /backtest/run` · `POST /backtest/optimize` · `POST /backtest/robust` |
| 资金/板块 | `GET /fundflow/overview` · `GET /sectors/overview` |
| 自选股 | `GET /watchlist` · `POST /watchlist/add` · `GET /watchlist/{symbol}/analysis` |
| 数据 | `GET /data/quality/check` · `POST /data/import/csv` · `POST /data/export/excel` |

完整列表见 `/docs`。

## 进度与路线图

当前：Phase 1（回测 / 数据管理 / 自选股）完成，Phase 2 K 线与技术指标进行中。详见 [PROGRESS.md](PROGRESS.md)。

计划方向：
- [ ] MACD / RSI / BOLL 指标面板、画线工具
- [x] 防过拟合回测规范（`POST /backtest/robust`，见 [BACKTEST_RULES.md](BACKTEST_RULES.md)）
- [ ] 因子模块：Alpha007 等因子的 IC / 分组收益回测
- [ ] 多智能体研究报告（多空辩论 + 风控评审，只输出研究结论）
- [ ] 信号 → 模拟盘 → 日志 → 仪表盘闭环；每日研究摘要推送
- [ ] 风控系统、投资组合优化

## License

MIT
