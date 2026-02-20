"""
API路由定义
"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, Request, UploadFile, File
from typing import List, Optional
from datetime import datetime

import pandas as pd

from app.models.schemas import (
    AnalysisResult, StrategyParams, BacktestResult, 
    MarketOverview, StockInfo
)
from app.services.data_service import data_service
from app.strategies.engine import StrategyEngine
from app.backtest.engine import BacktestEngine
from app.data.fetcher import data_fetcher

# 新增导入
from app.data.fundamentals import fundamental_fetcher, FundamentalData
from app.core.decorators import rate_limit, api_cache, performance_monitor
from app.models.watchlist import watchlist_manager
from app.data.manager import data_manager, DatabaseBackend

router = APIRouter()

# 全局策略引擎
strategy_engine = StrategyEngine()


@router.get("/")
@api_cache(ttl=60)
async def root():
    """API根路径"""
    return {
        "name": "Stock Analyzer API",
        "version": "1.0.0",
        "status": "running",
        "timestamp": datetime.now()
    }


@router.get("/market/overview", response_model=MarketOverview)
@rate_limit(requests_per_minute=60)
@api_cache(ttl=30)  # 30秒缓存
@performance_monitor(slow_threshold=2.0)
async def get_market_overview():
    """获取市场概览"""
    return data_service.get_market_overview()


@router.get("/stocks/search")
@rate_limit(requests_per_minute=30)
@api_cache(ttl=300)
async def search_stocks(query: str = Query(..., min_length=1)):
    """搜索股票"""
    results = data_service.search_stocks(query)
    return {"results": results, "count": len(results)}


@router.get("/stocks/{symbol}")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=60)
async def get_stock_detail(symbol: str):
    """获取股票详情"""
    detail = data_service.get_stock_detail(symbol)
    if not detail:
        raise HTTPException(status_code=404, detail=f"股票 {symbol} 未找到")
    return detail


@router.get("/stocks/{symbol}/quote")
@rate_limit(requests_per_minute=120)
@api_cache(ttl=10)
async def get_stock_quote(symbol: str):
    """
    获取股票实时报价
    
    返回当前价格、涨跌幅、成交量等实时行情数据
    """
    df = data_service.get_realtime_data()
    
    if df.empty:
        raise HTTPException(status_code=503, detail="数据服务暂不可用")
    
    stock_data = df[df['symbol'] == symbol]
    
    if stock_data.empty:
        raise HTTPException(status_code=404, detail=f"股票 {symbol} 未找到")
    
    row = stock_data.iloc[0]
    
    return {
        "symbol": symbol,
        "name": row.get('name', ''),
        "price": float(row.get('price', 0)),
        "change_percent": float(row.get('change_percent', 0)),
        "change_amount": float(row.get('change_amount', 0)),
        "volume": int(row.get('volume', 0)),
        "high": float(row.get('high', 0)),
        "low": float(row.get('low', 0)),
        "open": float(row.get('open', 0)),
        "pre_close": float(row.get('pre_close', 0)),
        "timestamp": datetime.now().isoformat()
    }


@router.get("/stocks/{symbol}/kline")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=300)
async def get_stock_kline(
    symbol: str,
    period: str = Query(default="daily", pattern="^(daily|weekly|monthly)$"),
    limit: int = Query(default=100, ge=1, le=500)
):
    """
    获取股票K线数据
    
    - period: K线周期 (daily/weekly/monthly)
    - limit: 返回数据条数，默认100，最大500
    
    返回格式：
    {
        "symbol": "股票代码",
        "period": "周期",
        "data": [
            {"date": "日期", "open": 开盘价, "high": 最高价, "low": 最低价, "close": 收盘价, "volume": 成交量},
            ...
        ]
    }
    """
    # 获取历史数据
    df = data_fetcher.get_stock_history(symbol, days=limit * 2)
    
    if df.empty:
        raise HTTPException(status_code=404, detail=f"无法获取股票 {symbol} 的历史数据")
    
    # 根据period进行数据重采样
    if period == "daily":
        # 日K线直接使用原始数据
        result_df = df.copy()
    elif period == "weekly":
        # 周K线：按周重采样
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        result_df = df.resample('W').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }).dropna().reset_index()
    elif period == "monthly":
        # 月K线：按月重采样
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        result_df = df.resample('ME').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }).dropna().reset_index()
    
    # 取最新的limit条数据
    result_df = result_df.tail(limit)
    
    # 转换为要求的格式
    kline_data = []
    for _, row in result_df.iterrows():
        kline_data.append({
            "date": row['date'].strftime('%Y-%m-%d') if isinstance(row['date'], datetime) else str(row['date']),
            "open": round(float(row['open']), 2),
            "high": round(float(row['high']), 2),
            "low": round(float(row['low']), 2),
            "close": round(float(row['close']), 2),
            "volume": int(row['volume'])
        })
    
    return {
        "symbol": symbol,
        "period": period,
        "klines": kline_data
    }


@router.get("/stocks/{symbol}/fundamentals")
@rate_limit(requests_per_minute=30)
@api_cache(ttl=3600)  # 基本面数据变化较慢，1小时缓存
async def get_stock_fundamentals(symbol: str):
    """
    获取股票基本面数据
    
    包含PE、PB、ROE、毛利率、营收增长率等多维度指标
    """
    # 先获取股票名称
    df = data_service.get_realtime_data()
    stock_info = df[df['symbol'] == symbol]
    name = stock_info.iloc[0]['name'] if not stock_info.empty else ""
    
    # 获取基本面数据
    fundamentals = fundamental_fetcher.get_fundamental_data(symbol, name)
    
    if not fundamentals:
        raise HTTPException(status_code=404, detail=f"无法获取 {symbol} 的基本面数据")
    
    # 计算基本面评分
    scores = fundamentals.calculate_fundamental_score()
    
    return {
        "symbol": fundamentals.symbol,
        "name": fundamentals.name,
        "valuation": {
            "pe_ttm": fundamentals.pe_ttm,
            "pe_lyr": fundamentals.pe_lyr,
            "pb": fundamentals.pb,
            "ps_ttm": fundamentals.ps_ttm,
            "pe_level": scores["pe_level"],
            "pb_level": scores["pb_level"]
        },
        "profitability": {
            "roe": round(fundamentals.roe * 100, 2) if fundamentals.roe else None,
            "roa": round(fundamentals.roa * 100, 2) if fundamentals.roa else None,
            "gross_margin": round(fundamentals.gross_margin * 100, 2) if fundamentals.gross_margin else None,
            "net_margin": round(fundamentals.net_margin * 100, 2) if fundamentals.net_margin else None,
            "roe_level": scores["roe_level"]
        },
        "growth": {
            "revenue_growth": round(fundamentals.revenue_growth * 100, 2) if fundamentals.revenue_growth else None,
            "profit_growth": round(fundamentals.profit_growth * 100, 2) if fundamentals.profit_growth else None
        },
        "financial_health": {
            "debt_ratio": round(fundamentals.debt_ratio * 100, 2) if fundamentals.debt_ratio else None
        },
        "market_cap": {
            "total": fundamentals.total_market_cap,
            "float": fundamentals.float_market_cap
        },
        "industry": fundamentals.industry,
        "scores": scores,
        "updated_at": fundamentals.updated_at.isoformat()
    }


@router.get("/fundamentals/top")
@rate_limit(requests_per_minute=10)
@api_cache(ttl=1800)  # 30分钟缓存
async def get_top_fundamentals(
    sort_by: str = Query(default="total", pattern="^(total|value|quality|growth)$"),
    limit: int = Query(default=20, ge=1, le=100),
    min_score: float = Query(default=50, ge=0, le=100)
):
    """
    获取基本面优质股票排行
    
    - sort_by: 排序方式 (total/value/quality/growth)
    - limit: 返回数量
    - min_score: 最低综合评分
    """
    try:
        # 获取市场基本面数据
        fundamentals_list = fundamental_fetcher.get_market_fundamentals(limit=100)
        
        # 计算评分并过滤
        results = []
        for fund in fundamentals_list:
            scores = fund.calculate_fundamental_score()
            if scores["total_score"] >= min_score:
                results.append({
                    "symbol": fund.symbol,
                    "name": fund.name,
                    "industry": fund.industry,
                    "pe_ttm": fund.pe_ttm,
                    "pb": fund.pb,
                    "roe": round(fund.roe * 100, 2) if fund.roe else None,
                    "scores": scores
                })
        
        # 排序
        sort_key = {
            "total": lambda x: x["scores"]["total_score"],
            "value": lambda x: x["scores"]["value_score"],
            "quality": lambda x: x["scores"]["quality_score"],
            "growth": lambda x: x["scores"]["growth_score"]
        }.get(sort_by, lambda x: x["scores"]["total_score"])
        
        results.sort(key=sort_key, reverse=True)
        
        return {
            "stocks": results[:limit],
            "total": len(results),
            "sort_by": sort_by
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取数据失败: {str(e)}")


@router.get("/fundamentals/industry/{industry}")
@rate_limit(requests_per_minute=10)
@api_cache(ttl=3600)
async def get_industry_fundamentals(industry: str):
    """获取行业基本面统计数据"""
    try:
        industry_data = fundamental_fetcher.get_industry_fundamentals(industry)
        
        if not industry_data:
            return {
                "industry": industry,
                "stock_count": 0,
                "avg_pe": None,
                "avg_pb": None,
                "avg_roe": None
            }
        
        # 计算行业平均指标
        pe_values = [f.pe_ttm for f in industry_data if f.pe_ttm and f.pe_ttm > 0]
        pb_values = [f.pb for f in industry_data if f.pb and f.pb > 0]
        roe_values = [f.roe for f in industry_data if f.roe]
        
        import statistics
        
        return {
            "industry": industry,
            "stock_count": len(industry_data),
            "avg_pe": round(statistics.median(pe_values), 2) if pe_values else None,
            "avg_pb": round(statistics.median(pb_values), 2) if pb_values else None,
            "avg_roe": round(statistics.median(roe_values) * 100, 2) if roe_values else None,
            "stocks": [
                {
                    "symbol": f.symbol,
                    "name": f.name,
                    "pe_ttm": f.pe_ttm,
                    "pb": f.pb,
                    "roe": round(f.roe * 100, 2) if f.roe else None
                }
                for f in industry_data[:20]  # 只返回前20只
            ]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取行业数据失败: {str(e)}")


@router.post("/analysis/run")
@rate_limit(requests_per_minute=5)  # 限制全市场分析频率
async def run_analysis(max_stocks: int = Query(default=100, ge=10, le=500)):
    """
    运行全市场分析
    
    - max_stocks: 最多分析多少只股票（按市值排序）
    """
    results = data_service.analyze_all_stocks(max_stocks=max_stocks)
    return {
        "message": "分析完成",
        "analyzed_count": len(results),
        "timestamp": datetime.now(),
        "top_picks": [r.dict() for r in results[:10]]
    }


@router.get("/analysis/results", response_model=List[AnalysisResult])
@rate_limit(requests_per_minute=60)
@api_cache(ttl=60)
async def get_analysis_results(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    min_score: Optional[float] = Query(default=None, ge=0, le=100),
    sort_by: str = Query(default="score", pattern="^(score|probability|change)$"),
    count_only: bool = Query(default=False, description="仅返回总数")
):
    """
    获取分析结果
    
    - limit: 返回数量
    - offset: 跳过数量（分页用）
    - min_score: 最低综合评分过滤
    - sort_by: 排序方式 (score/probability/change)
    - count_only: 仅返回总数（用于分页）
    """
    results = data_service._analysis_results
    
    if not results:
        # 如果没有分析结果，先运行分析
        results = data_service.analyze_all_stocks(max_stocks=100)
    
    # 重新排序
    results = strategy_engine.rank_stocks(results, sort_by=sort_by)
    
    # 过滤
    if min_score is not None:
        results = [r for r in results if r.total_score >= min_score]
    
    total = len(results)
    
    # 如果只需要总数，返回空列表并在header中设置总数
    if count_only:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content=[],
            headers={"X-Total-Count": str(total)}
        )
    
    # 分页
    results = results[offset:offset + limit]
    
    return results


@router.get("/analysis/top")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=120)
async def get_top_stocks(
    n: int = Query(default=20, ge=1, le=100),
    min_score: float = Query(default=60, ge=0, le=100)
):
    """获取推荐股票"""
    results = data_service.get_top_picks(n=n, min_score=min_score)
    return {
        "recommendations": [r.dict() for r in results],
        "count": len(results),
        "filters": {"min_score": min_score}
    }


@router.get("/analysis/multi-factor")
@rate_limit(requests_per_minute=30)
@api_cache(ttl=300)
async def get_multi_factor_analysis(
    symbol: str = Query(..., description="股票代码"),
    include_fundamentals: bool = Query(default=True, description="包含基本面分析")
):
    """
    多因子综合分析
    
    结合技术分析和基本面分析的综合评分
    """
    # 获取技术分析结果
    tech_analysis = None
    for result in data_service._analysis_results:
        if result.symbol == symbol:
            tech_analysis = result
            break
    
    # 如果没有缓存，执行分析
    if not tech_analysis:
        from app.models.schemas import TrendDirection
        df = data_fetcher.get_stock_history(symbol, days=60)
        if not df.empty and len(df) >= 20:
            tech_analysis = strategy_engine.analyze_stock(df, symbol, "")
    
    if not tech_analysis:
        raise HTTPException(status_code=404, detail=f"无法分析股票 {symbol}")
    
    result = {
        "symbol": symbol,
        "name": tech_analysis.name,
        "technical": {
            "score": tech_analysis.total_score,
            "trend": tech_analysis.trend_direction,
            "up_probability": tech_analysis.up_probability,
            "confidence": tech_analysis.confidence,
            "signals": [
                {"name": s.name, "signal": s.signal, "weight": s.weight}
                for s in tech_analysis.signals
            ]
        },
        "fundamental": None,
        "combined_score": tech_analysis.total_score
    }
    
    # 获取基本面数据
    if include_fundamentals:
        df = data_service.get_realtime_data()
        stock_info = df[df['symbol'] == symbol]
        name = stock_info.iloc[0]['name'] if not stock_info.empty else ""
        
        fundamentals = fundamental_fetcher.get_fundamental_data(symbol, name)
        if fundamentals:
            fund_scores = fundamentals.calculate_fundamental_score()
            
            result["fundamental"] = {
                "pe_ttm": fundamentals.pe_ttm,
                "pb": fundamentals.pb,
                "roe": round(fundamentals.roe * 100, 2) if fundamentals.roe else None,
                "scores": fund_scores
            }
            
            # 计算综合得分（技术60% + 基本面40%）
            result["combined_score"] = round(
                tech_analysis.total_score * 0.6 +
                fund_scores["total_score"] * 0.4,
                2
            )
    
    return result


@router.get("/strategy/params")
@api_cache(ttl=300)
async def get_strategy_params():
    """获取当前策略参数"""
    return strategy_engine.get_strategy_summary()


@router.post("/strategy/params")
@rate_limit(requests_per_minute=10)
async def update_strategy_params(params: StrategyParams):
    """更新策略参数"""
    strategy_engine.update_params(params)
    data_service.strategy = strategy_engine  # 更新数据服务的策略引擎
    return {
        "message": "策略参数已更新",
        "params": params.dict()
    }


@router.post("/backtest/run")
@rate_limit(requests_per_minute=10)
@performance_monitor(slow_threshold=5.0)
async def run_backtest(
    symbol: str,
    days: int = Query(default=120, ge=30, le=500),
    params: Optional[StrategyParams] = None
):
    """
    对单只股票进行回测
    
    - symbol: 股票代码
    - days: 回测天数
    - params: 策略参数（不传则使用当前参数）
    """
    try:
        # 获取历史数据
        df = data_fetcher.get_stock_history(symbol, days=days)
        
        if df.empty or len(df) < 30:
            raise HTTPException(status_code=400, detail=f"无法获取 {symbol} 的足够历史数据")
        
        # 使用传入参数或当前参数
        backtest_params = params.dict() if params else strategy_engine.params.dict()
        
        # 运行回测
        engine = BacktestEngine()
        result = engine.run_backtest(df, backtest_params)
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回测失败: {str(e)}")


@router.post("/backtest/optimize")
@rate_limit(requests_per_minute=3)  # 限制优化请求频率
@performance_monitor(slow_threshold=30.0)
async def optimize_strategy(
    symbol: str,
    days: int = Query(default=120, ge=30, le=500),
    combinations: int = Query(default=20, ge=5, le=50)
):
    """
    策略参数优化
    
    对指定股票进行参数网格搜索，找到最优参数
    """
    try:
        # 获取历史数据
        df = data_fetcher.get_stock_history(symbol, days=days)
        
        if df.empty or len(df) < 30:
            raise HTTPException(status_code=400, detail=f"无法获取 {symbol} 的足够历史数据")
        
        # 生成参数组合
        param_combinations = strategy_engine.generate_param_combinations(n_combinations=combinations)
        
        # 运行优化
        engine = BacktestEngine()
        best_result, all_results = engine.optimize_parameters(
            df, 
            [p.dict() for p in param_combinations]
        )
        
        # 更新最优参数
        if best_result:
            optimal_params = StrategyParams(**best_result['params'])
            strategy_engine.update_params(optimal_params)
            data_service.strategy = strategy_engine
        
        return {
            "optimal_params": best_result['params'] if best_result else None,
            "optimal_metrics": {
                "total_return": best_result['total_return'] if best_result else 0,
                "sharpe_ratio": best_result['sharpe_ratio'] if best_result else 0,
                "win_rate": best_result['win_rate'] if best_result else 0,
                "max_drawdown": best_result['max_drawdown'] if best_result else 0,
            },
            "tested_combinations": len(all_results),
            "all_results": all_results[:10]  # 只返回前10个结果
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"优化失败: {str(e)}")


@router.get("/data/realtime")
@rate_limit(requests_per_minute=120)
@api_cache(ttl=30)
async def get_realtime_data(limit: int = Query(default=100, ge=1, le=500)):
    """获取实时行情数据"""
    df = data_service.get_realtime_data()
    
    if df.empty:
        raise HTTPException(status_code=503, detail="数据服务暂不可用")
    
    # 转换为字典列表
    data = df.head(limit).to_dict('records')
    
    return {
        "data": data,
        "count": len(data),
        "timestamp": datetime.now()
    }


@router.post("/data/update")
@rate_limit(requests_per_minute=5)
async def force_update_data(background_tasks: BackgroundTasks):
    """强制更新数据"""
    background_tasks.add_task(data_service.update_realtime_data)
    return {"message": "数据更新任务已启动", "timestamp": datetime.now()}


@router.get("/system/cache-stats")
@rate_limit(requests_per_minute=10)
async def get_cache_stats():
    """获取缓存统计信息"""
    from app.data.cache import data_cache
    return data_cache.get_cache_stats()


@router.post("/system/clear-cache")
@rate_limit(requests_per_minute=5)
async def clear_cache(days: int = Query(default=7, ge=1, le=30)):
    """清理旧缓存"""
    from app.data.cache import data_cache
    data_cache.clear_old_cache(days=days)
    return {"message": f"已清理{days}天前的缓存"}


@router.get("/system/websocket-stats")
@rate_limit(requests_per_minute=10)
async def get_websocket_stats():
    """获取WebSocket统计信息"""
    from app.api.websocket import ws_manager
    return ws_manager.get_stats()


# ========== Phase 3 新增功能 ==========

@router.get("/fundflow/overview")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=60)
async def get_fund_flow_overview():
    """
    获取资金流向概览
    
    返回主力资金和散户资金的净流入情况
    """
    try:
        # 获取实时数据
        df = data_service.get_realtime_data()
        
        if df.empty:
            raise HTTPException(status_code=503, detail="数据服务暂不可用")
        
        # 模拟资金流向计算（实际项目中应接入真实数据源）
        total_value = df['price'].sum() * 1000000  # 模拟总市值
        main_net_inflow = round((0.02 + (0.01 * (hash(datetime.now().isoformat()) % 10 - 5) / 10)) * total_value / 100000000, 2)
        retail_net_inflow = round(-main_net_inflow * 0.35, 2)
        big_order_ratio = round(55 + (hash(datetime.now().isoformat()) % 20), 1)
        
        return {
            "summary": {
                "main_net_inflow": main_net_inflow,
                "retail_net_inflow": retail_net_inflow,
                "big_order_ratio": min(95, max(30, big_order_ratio)),
                "total_volume": round(total_value / 100000000, 2)
            },
            "main_flow_trend": generate_fund_flow_trend(),
            "retail_flow_trend": generate_retail_flow_trend(),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取资金流向失败: {str(e)}")


@router.get("/fundflow/top-inflow")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=60)
async def get_fund_flow_top_inflow(
    limit: int = Query(default=10, ge=1, le=50),
    type: str = Query(default="main", pattern="^(main|retail|all)$")
):
    """
    获取资金净流入排行
    
    - type: 资金类型 (main-主力, retail-散户, all-全部)
    - limit: 返回数量
    """
    try:
        df = data_service.get_realtime_data()
        
        if df.empty:
            raise HTTPException(status_code=503, detail="数据服务暂不可用")
        
        # 模拟资金流向数据
        results = []
        for idx, row in df.head(limit * 2).iterrows():
            base_inflow = row.get('change_percent', 0) * 10
            main_inflow = base_inflow + (hash(row['symbol']) % 50 - 25)
            retail_inflow = -main_inflow * 0.3 + (hash(row['symbol'] + 'retail') % 20 - 10)
            
            results.append({
                "rank": len(results) + 1,
                "symbol": row['symbol'],
                "name": row.get('name', ''),
                "price": round(row.get('price', 0), 2),
                "change": round(row.get('change_percent', 0), 2),
                "net_inflow": round(main_inflow + retail_inflow, 2),
                "main_inflow": round(main_inflow, 2),
                "retail_inflow": round(retail_inflow, 2),
                "ratio": round(abs(main_inflow) / (abs(main_inflow) + 10) * 100, 1),
                "tags": [
                    {"name": "主力增仓", "color": "green"} if main_inflow > 0 else {"name": "主力减仓", "color": "red"}
                ] if abs(main_inflow) > 10 else []
            })
        
        # 按净流入排序
        results.sort(key=lambda x: x['net_inflow'], reverse=True)
        
        # 重新排名
        for i, r in enumerate(results[:limit]):
            r['rank'] = i + 1
            
        return {
            "stocks": results[:limit],
            "count": len(results[:limit]),
            "type": type,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取资金排行失败: {str(e)}")


@router.get("/fundflow/top-outflow")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=60)
async def get_fund_flow_top_outflow(
    limit: int = Query(default=10, ge=1, le=50),
    type: str = Query(default="main", pattern="^(main|retail|all)$")
):
    """
    获取资金净流出排行
    
    - type: 资金类型 (main-主力, retail-散户, all-全部)
    - limit: 返回数量
    """
    try:
        df = data_service.get_realtime_data()
        
        if df.empty:
            raise HTTPException(status_code=503, detail="数据服务暂不可用")
        
        # 模拟资金流向数据
        results = []
        for idx, row in df.head(limit * 2).iterrows():
            base_inflow = -row.get('change_percent', 0) * 8
            main_inflow = base_inflow - (hash(row['symbol']) % 40)
            retail_inflow = -main_inflow * 0.2
            
            results.append({
                "rank": len(results) + 1,
                "symbol": row['symbol'],
                "name": row.get('name', ''),
                "price": round(row.get('price', 0), 2),
                "change": round(row.get('change_percent', 0), 2),
                "net_inflow": round(main_inflow + retail_inflow, 2),
                "main_inflow": round(main_inflow, 2),
                "retail_inflow": round(retail_inflow, 2),
                "ratio": round(abs(main_inflow) / (abs(main_inflow) + 10) * 100, 1),
                "tags": [
                    {"name": "主力减仓", "color": "red"}
                ] if main_inflow < -10 else []
            })
        
        # 按净流出排序（值越小越靠前）
        results.sort(key=lambda x: x['net_inflow'])
        
        # 重新排名
        for i, r in enumerate(results[:limit]):
            r['rank'] = i + 1
            
        return {
            "stocks": results[:limit],
            "count": len(results[:limit]),
            "type": type,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取资金流出排行失败: {str(e)}")


# ========== 板块数据API ==========

@router.get("/sectors/overview")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=60)
async def get_sectors_overview():
    """
    获取板块概览
    
    返回所有行业的涨跌情况和资金流向
    """
    try:
        sectors = [
            {"code": "bk01", "name": "半导体", "description": "芯片设计、制造、封装测试"},
            {"code": "bk02", "name": "新能源", "description": "光伏、风电、储能"},
            {"code": "bk03", "name": "白酒", "description": "白酒酿造与销售"},
            {"code": "bk04", "name": "医药", "description": "制药、医疗器械"},
            {"code": "bk05", "name": "银行", "description": "商业银行、投资银行"},
            {"code": "bk06", "name": "地产", "description": "房地产开发"},
            {"code": "bk07", "name": "汽车", "description": "整车制造、零部件"},
            {"code": "bk08", "name": "化工", "description": "基础化工、精细化工"},
            {"code": "bk09", "name": "钢铁", "description": "钢铁冶炼"},
            {"code": "bk10", "name": "有色", "description": "有色金属"},
            {"code": "bk11", "name": "计算机", "description": "软件开发、IT服务"},
            {"code": "bk12", "name": "通信", "description": "通信设备、运营"}
        ]
        
        results = []
        for sector in sectors:
            change = (hash(sector['code'] + datetime.now().strftime('%H')) % 100 - 40) / 10
            is_hot = change > 3 or (hash(sector['code']) % 10 > 7)
            
            # 模拟领涨股
            leader_names = {
                'bk01': {'symbol': '688981', 'name': '中芯国际'},
                'bk02': {'symbol': '601012', 'name': '隆基绿能'},
                'bk03': {'symbol': '600519', 'name': '贵州茅台'},
                'bk04': {'symbol': '600276', 'name': '恒瑞医药'},
                'bk05': {'symbol': '600036', 'name': '招商银行'},
                'bk06': {'symbol': '000002', 'name': '万科A'},
                'bk07': {'symbol': '002594', 'name': '比亚迪'},
                'bk08': {'symbol': '600309', 'name': '万华化学'},
                'bk09': {'symbol': '600019', 'name': '宝钢股份'},
                'bk10': {'symbol': '600362', 'name': '江西铜业'},
                'bk11': {'symbol': '688111', 'name': '金山办公'},
                'bk12': {'symbol': '000063', 'name': '中兴通讯'}
            }
            
            results.append({
                **sector,
                "rank": 0,  # 稍后设置
                "change": round(change, 2),
                "volume": round(50 + abs(change) * 30 + hash(sector['code']) % 100, 1),
                "up_count": max(0, int(30 + change * 5 + hash(sector['code']) % 20)),
                "down_count": max(0, int(20 - change * 3 + hash(sector['code']) % 15)),
                "flat_count": int(hash(sector['code']) % 10),
                "is_hot": is_hot,
                "leader": leader_names.get(sector['code'], {'symbol': '000001', 'name': '平安银行'}),
                "main_inflow": round(change * 5 + (hash(sector['code']) % 20 - 10), 2),
                "retail_inflow": round(-change * 2 + (hash(sector['code']) % 10 - 5), 2)
            })
        
        # 按涨跌幅排序
        results.sort(key=lambda x: x['change'], reverse=True)
        for i, r in enumerate(results):
            r['rank'] = i + 1
        
        up_sectors = len([s for s in results if s['change'] > 0])
        avg_change = round(sum(s['change'] for s in results) / len(results), 2)
        total_volume = round(sum(s['volume'] for s in results), 1)
        
        return {
            "sectors": results,
            "stats": {
                "up_sectors": up_sectors,
                "down_sectors": len(results) - up_sectors,
                "total_sectors": len(results),
                "avg_change": avg_change,
                "total_volume": total_volume
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取板块数据失败: {str(e)}")


@router.get("/sectors/{sector_code}")
@rate_limit(requests_per_minute=30)
@api_cache(ttl=120)
async def get_sector_detail(sector_code: str):
    """
    获取板块详情
    
    包含板块内个股列表
    """
    try:
        # 模拟板块数据
        sector_names = {
            'bk01': '半导体', 'bk02': '新能源', 'bk03': '白酒',
            'bk04': '医药', 'bk05': '银行', 'bk06': '地产',
            'bk07': '汽车', 'bk08': '化工', 'bk09': '钢铁',
            'bk10': '有色', 'bk11': '计算机', 'bk12': '通信'
        }
        
        sector_name = sector_names.get(sector_code, '未知板块')
        base_change = (hash(sector_code + datetime.now().strftime('%H')) % 100 - 40) / 10
        
        # 生成板块内股票
        stocks = []
        for i in range(15):
            symbol = f"{600000 + hash(sector_code + str(i)) % 4000}"
            change = base_change + (hash(symbol) % 20 - 10) / 10
            
            stocks.append({
                "rank": i + 1,
                "symbol": symbol,
                "name": f"{sector_name}股票{i+1}",
                "price": round(10 + hash(symbol) % 200, 2),
                "change": round(change, 2),
                "net_inflow": round(change * 2 + (hash(symbol) % 10 - 5), 2)
            })
        
        stocks.sort(key=lambda x: x['change'], reverse=True)
        for i, s in enumerate(stocks):
            s['rank'] = i + 1
        
        up_count = len([s for s in stocks if s['change'] > 0])
        down_count = len([s for s in stocks if s['change'] < 0])
        flat_count = len(stocks) - up_count - down_count
        
        return {
            "code": sector_code,
            "name": sector_name,
            "description": f"{sector_name}行业板块",
            "change": round(base_change, 2),
            "volume": round(100 + abs(base_change) * 50, 1),
            "up_count": up_count,
            "down_count": down_count,
            "flat_count": flat_count,
            "main_inflow": round(base_change * 10, 2),
            "retail_inflow": round(-base_change * 3, 2),
            "stocks": stocks,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取板块详情失败: {str(e)}")


# ========== 投资组合API ==========

@router.post("/portfolio/analyze")
@rate_limit(requests_per_minute=30)
async def analyze_portfolio(portfolio: dict):
    """
    分析投资组合
    
    输入：
    {
        "stocks": [
            {"symbol": "600519", "name": "贵州茅台", "price": 1688.88, "quantity": 100},
            ...
        ]
    }
    
    返回：风险指标、收益分析、配置建议
    """
    try:
        stocks = portfolio.get('stocks', [])
        
        if not stocks:
            raise HTTPException(status_code=400, detail="投资组合不能为空")
        
        # 计算总市值
        total_value = sum(s['price'] * s['quantity'] for s in stocks)
        
        # 计算权重
        for stock in stocks:
            stock['weight'] = round((stock['price'] * stock['quantity']) / total_value * 100, 2)
        
        # 模拟分析结果
        # 波动率（基于持仓数量，持仓越多通常越分散）
        diversification = min(100, len(stocks) * 20 + 10)
        base_volatility = 25 - diversification * 0.15
        volatility = round(base_volatility + (hash(str(stocks)) % 10 - 5), 2)
        
        # 夏普比率
        sharpe_ratio = round(0.5 + (diversification / 100) * 1.0 + (hash(str(stocks)) % 10 - 5) / 20, 2)
        
        # 收益率
        total_return = round(5 + (hash(str(stocks)) % 40 - 10) / 2, 2)
        
        # 最大回撤
        max_drawdown = round(-15 - (hash(str(stocks)) % 10), 2)
        
        # 风险等级 (1-10)
        risk_level = max(1, min(10, int(volatility / 3)))
        
        # 收益评分
        return_score = min(100, max(0, int(sharpe_ratio * 30 + total_return * 2)))
        
        return {
            "total_value": round(total_value, 2),
            "total_return": total_return,
            "volatility": volatility,
            "sharpe_ratio": sharpe_ratio,
            "max_drawdown": max_drawdown,
            "beta": round(0.8 + (hash(str(stocks)) % 40) / 100, 2),
            "alpha": round(1 + (hash(str(stocks)) % 20 - 10) / 10, 2),
            "risk_level": risk_level,
            "return_score": return_score,
            "diversification": diversification,
            "stocks": stocks,
            "returns": generate_portfolio_returns(),
            "suggestions": generate_portfolio_suggestions(stocks, diversification, risk_level),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"组合分析失败: {str(e)}")


@router.post("/portfolio/optimize")
@rate_limit(requests_per_minute=10)
async def optimize_portfolio(portfolio: dict):
    """
    优化投资组合建议
    
    根据当前持仓给出优化建议
    """
    try:
        stocks = portfolio.get('stocks', [])
        
        if not stocks:
            raise HTTPException(status_code=400, detail="投资组合不能为空")
        
        # 分析当前组合
        current = await analyze_portfolio(portfolio)
        
        # 生成优化建议
        suggestions = []
        
        # 检查集中度
        max_weight = max(s['weight'] for s in stocks)
        if max_weight > 40:
            suggestions.append({
                "type": "warning",
                "title": "持仓过于集中",
                "content": f"最大持仓占比{max_weight:.1f}%，建议分散投资降低风险",
                "action": "查看调仓建议"
            })
        
        # 检查分散度
        if len(stocks) < 3:
            suggestions.append({
                "type": "info",
                "title": "建议增加持仓数量",
                "content": "当前持仓较少，建议配置3-8只股票分散风险",
                "action": "添加股票"
            })
        
        return {
            "current_metrics": {
                "risk_level": current["risk_level"],
                "return_score": current["return_score"],
                "diversification": current["diversification"]
            },
            "suggestions": suggestions + current["suggestions"],
            "optimized_allocation": generate_optimized_allocation(stocks),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"组合优化失败: {str(e)}")


# ========== 辅助函数 ==========

def generate_fund_flow_trend():
    """生成资金流向趋势数据"""
    times = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00']
    data = []
    base_inflow = 25
    base_outflow = 20
    
    for time in times:
        inflow = base_inflow + (hash(time) % 20 - 10)
        outflow = base_outflow + (hash(time + 'out') % 15 - 7)
        data.append({"time": time, "type": "流入", "value": round(inflow, 1)})
        data.append({"time": time, "type": "流出", "value": round(outflow, 1)})
    
    return data


def generate_retail_flow_trend():
    """生成散户资金流向趋势数据"""
    times = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00']
    return [{"time": t, "value": round((hash(t) % 40 - 20) / 2, 1)} for t in times]


def generate_portfolio_returns():
    """生成组合收益走势数据"""
    dates = []
    portfolio_values = []
    benchmark_values = []
    
    portfolio_value = 0
    benchmark_value = 0
    
    for i in range(30):
        date = datetime.now()
        date = date.replace(day=date.day - (30 - i))
        dates.append(date.strftime('%Y-%m-%d'))
        
        portfolio_value += (hash(str(i)) % 10 - 4) / 10
        benchmark_value += (hash(str(i) + 'bench') % 8 - 3.8) / 10
        
        portfolio_values.append({
            "date": dates[-1],
            "type": "组合收益",
            "value": round(portfolio_value, 2)
        })
        benchmark_values.append({
            "date": dates[-1],
            "type": "基准收益",
            "value": round(benchmark_value, 2)
        })
    
    return portfolio_values + benchmark_values


def generate_portfolio_suggestions(stocks, diversification, risk_level):
    """生成配置建议"""
    suggestions = []
    
    if diversification > 60:
        suggestions.append({
            "type": "success",
            "title": "组合分散度良好",
            "content": f"当前组合包含{len(stocks)}只股票，分散度评分{diversification}，有效降低了单一股票风险。"
        })
    
    # 检查行业集中
    if len(stocks) >= 2:
        # 模拟行业检查
        has_same_sector = hash(str(stocks)) % 10 > 5
        if has_same_sector:
            suggestions.append({
                "type": "warning",
                "title": "部分持仓行业重合",
                "content": "检测到部分股票属于同一行业，建议适当分散到不同行业板块。",
                "action": "查看调仓建议"
            })
    
    if risk_level > 6:
        suggestions.append({
            "type": "info",
            "title": "当前风险等级偏高",
            "content": f"风险等级为{risk_level}/10，建议关注风险控制，可考虑增加防御性资产配置。"
        })
    
    return suggestions


def generate_optimized_allocation(stocks):
    """生成优化后的配置建议"""
    total_value = sum(s['price'] * s['quantity'] for s in stocks)
    optimized = []
    
    for stock in stocks:
        current_weight = (stock['price'] * stock['quantity']) / total_value * 100
        # 建议权重：如果当前超过40%，建议降低到30%
        suggested_weight = min(current_weight, 30) if current_weight > 40 else current_weight
        
        optimized.append({
            "symbol": stock['symbol'],
            "name": stock['name'],
            "current_weight": round(current_weight, 2),
            "suggested_weight": round(suggested_weight, 2),
            "action": "reduce" if current_weight > 40 else "hold"
        })
    
    return optimized


# ========== 自选股API ==========

@router.get("/watchlist")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=30)
async def get_watchlist(user_id: str = Query(default='default')):
    """
    获取自选股列表
    
    返回用户的所有自选股，包含添加时间和预警设置
    """
    try:
        items = watchlist_manager.get_watchlist(user_id)
        
        # 获取实时数据
        stocks_with_data = []
        for item in items:
            try:
                quote = data_service.get_stock_quote(item['symbol'])
                stocks_with_data.append({
                    **item,
                    'quote': quote
                })
            except Exception as e:
                # 如果获取实时数据失败，仍然返回基本信息
                stocks_with_data.append({
                    **item,
                    'quote': None
                })
        
        return {
            'stocks': stocks_with_data,
            'count': len(stocks_with_data),
            'user_id': user_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取自选股失败: {str(e)}")


@router.post("/watchlist/add")
@rate_limit(requests_per_minute=30)
async def add_to_watchlist(
    symbol: str,
    name: str = None,
    user_id: str = Query(default='default'),
    alert_price_high: Optional[float] = None,
    alert_price_low: Optional[float] = None,
    notes: Optional[str] = None
):
    """
    添加股票到自选股
    
    - symbol: 股票代码（必填）
    - name: 股票名称（可选，自动获取）
    - alert_price_high: 高价预警线（可选）
    - alert_price_low: 低价预警线（可选）
    - notes: 备注（可选）
    """
    try:
        # 如果没有提供名称，尝试获取
        if not name:
            quote = data_service.get_stock_quote(symbol)
            name = quote.get('name', symbol)
        
        result = watchlist_manager.add_stock(
            symbol=symbol,
            name=name,
            user_id=user_id,
            alert_high=alert_price_high,
            alert_low=alert_price_low,
            notes=notes
        )
        
        if not result['success']:
            raise HTTPException(status_code=400, detail=result['message'])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"添加失败: {str(e)}")


@router.delete("/watchlist/{symbol}")
@rate_limit(requests_per_minute=30)
async def remove_from_watchlist(
    symbol: str,
    user_id: str = Query(default='default')
):
    """
    从自选股中移除股票
    """
    try:
        result = watchlist_manager.remove_stock(symbol, user_id)
        
        if not result['success']:
            raise HTTPException(status_code=404, detail=result['message'])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"移除失败: {str(e)}")


@router.get("/watchlist/{symbol}")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=30)
async def get_watchlist_item(
    symbol: str,
    user_id: str = Query(default='default')
):
    """
    获取单个自选股的详细信息
    """
    try:
        item = watchlist_manager.get_stock(symbol, user_id)
        
        if not item:
            raise HTTPException(status_code=404, detail="股票不在自选列表中")
        
        # 获取实时行情
        quote = data_service.get_stock_quote(symbol)
        
        return {
            'watchlist': item,
            'quote': quote
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}")


@router.put("/watchlist/{symbol}")
@rate_limit(requests_per_minute=30)
async def update_watchlist_item(
    symbol: str,
    user_id: str = Query(default='default'),
    alert_price_high: Optional[float] = None,
    alert_price_low: Optional[float] = None,
    notes: Optional[str] = None
):
    """
    更新自选股信息（预警价格、备注等）
    """
    try:
        result = watchlist_manager.update_stock(
            symbol=symbol,
            user_id=user_id,
            alert_high=alert_price_high,
            alert_low=alert_price_low,
            notes=notes
        )
        
        if not result['success']:
            raise HTTPException(status_code=404, detail=result['message'])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}")


@router.get("/watchlist/check/{symbol}")
@rate_limit(requests_per_minute=120)
@api_cache(ttl=10)
async def check_watchlist(
    symbol: str,
    user_id: str = Query(default='default')
):
    """
    检查股票是否在自选股列表中
    """
    try:
        is_watched = watchlist_manager.is_in_watchlist(symbol, user_id)
        
        return {
            'symbol': symbol,
            'in_watchlist': is_watched
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检查失败: {str(e)}")


@router.post("/watchlist/import")
@rate_limit(requests_per_minute=10)
async def import_watchlist(
    data: dict,
    user_id: str = Query(default='default')
):
    """
    批量导入自选股
    
    请求体：
    {
        "stocks": [
            {"symbol": "600519", "name": "贵州茅台"},
            {"symbol": "000858", "name": "五粮液"}
        ]
    }
    """
    try:
        stocks = data.get('stocks', [])
        
        if not stocks:
            raise HTTPException(status_code=400, detail="股票列表不能为空")
        
        result = watchlist_manager.import_watchlist(stocks, user_id)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")


@router.delete("/watchlist")
@rate_limit(requests_per_minute=5)
async def clear_watchlist(user_id: str = Query(default='default')):
    """
    清空自选股列表
    """
    try:
        result = watchlist_manager.clear_watchlist(user_id)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清空失败: {str(e)}")


@router.get("/watchlist/stats")
@rate_limit(requests_per_minute=30)
@api_cache(ttl=60)
async def get_watchlist_stats(user_id: str = Query(default='default')):
    """
    获取自选股统计信息
    """
    try:
        stats = watchlist_manager.get_statistics(user_id)
        return stats
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")


@router.get("/watchlist/{symbol}/analysis")
@rate_limit(requests_per_minute=30)
@api_cache(ttl=120)
async def get_watchlist_stock_analysis(
    symbol: str,
    user_id: str = Query(default='default'),
    include_fundamentals: bool = Query(default=True)
):
    """
    获取自选股的综合分析
    
    结合技术分析和基本面分析
    """
    try:
        # 检查是否在自选股中
        if not watchlist_manager.is_in_watchlist(symbol, user_id):
            raise HTTPException(status_code=404, detail="股票不在自选列表中")
        
        # 获取技术分析（复用现有接口逻辑）
        tech_analysis = None
        for result in data_service._analysis_results:
            if result.symbol == symbol:
                tech_analysis = result
                break
        
        if not tech_analysis:
            from app.models.schemas import TrendDirection
            df = data_fetcher.get_stock_history(symbol, days=60)
            if not df.empty and len(df) >= 20:
                tech_analysis = strategy_engine.analyze_stock(df, symbol, "")
        
        # 获取基本面数据
        fundamental_data = None
        if include_fundamentals:
            df = data_service.get_realtime_data()
            stock_info = df[df['symbol'] == symbol]
            name = stock_info.iloc[0]['name'] if not stock_info.empty else ""
            
            fundamentals = fundamental_fetcher.get_fundamental_data(symbol, name)
            if fundamentals:
                fund_scores = fundamentals.calculate_fundamental_score()
                fundamental_data = {
                    'pe_ttm': fundamentals.pe_ttm,
                    'pb': fundamentals.pb,
                    'roe': round(fundamentals.roe * 100, 2) if fundamentals.roe else None,
                    'scores': fund_scores
                }
        
        # 获取实时行情
        quote = data_service.get_stock_quote(symbol)
        
        return {
            'symbol': symbol,
            'name': tech_analysis.name if tech_analysis else quote.get('name', ''),
            'quote': quote,
            'technical': {
                'score': tech_analysis.total_score if tech_analysis else None,
                'trend': tech_analysis.trend_direction if tech_analysis else None,
                'up_probability': tech_analysis.up_probability if tech_analysis else None,
                'confidence': tech_analysis.confidence if tech_analysis else None
            } if tech_analysis else None,
            'fundamental': fundamental_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")


# ========== 数据管理API ==========

@router.get("/data/stats")
@rate_limit(requests_per_minute=30)
async def get_database_stats():
    """
    获取数据库统计信息
    
    返回：股票数量、记录数、日期范围、数据库大小
    """
    try:
        stats = data_manager.get_database_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")


@router.get("/data/symbols")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=300)
async def get_data_symbols():
    """
    获取数据库中的所有股票代码
    """
    try:
        symbols = data_manager.get_symbol_list()
        return {
            'symbols': symbols,
            'count': len(symbols)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取股票列表失败: {str(e)}")


@router.get("/data/history/{symbol}")
@rate_limit(requests_per_minute=120)
@api_cache(ttl=60)
async def get_stock_history_data(
    symbol: str,
    start_date: Optional[str] = Query(default=None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(default=None, description="结束日期 YYYY-MM-DD"),
    limit: Optional[int] = Query(default=None, ge=1, le=500, description="返回条数限制")
):
    """
    获取股票历史数据（从数据库查询）
    """
    try:
        df = data_manager.get_stock_history(symbol, start_date, end_date, limit)
        
        if df.empty:
            raise HTTPException(status_code=404, detail=f"未找到 {symbol} 的历史数据")
        
        # 转换为字典列表
        records = df.to_dict('records')
        
        # 转换日期格式
        for record in records:
            if 'date' in record and hasattr(record['date'], 'isoformat'):
                record['date'] = record['date'].isoformat()
        
        return {
            'symbol': symbol,
            'data': records,
            'count': len(records),
            'start_date': records[0]['date'] if records else None,
            'end_date': records[-1]['date'] if records else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取历史数据失败: {str(e)}")


@router.get("/data/range/{symbol}")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=300)
async def get_stock_date_range(symbol: str):
    """
    获取股票数据的时间范围
    """
    try:
        result = data_manager.get_date_range(symbol)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取时间范围失败: {str(e)}")


@router.post("/data/import/csv")
@rate_limit(requests_per_minute=10)
async def import_csv(
    file: UploadFile = File(...),
    symbol: Optional[str] = Query(default=None, description="股票代码（可选，从文件名提取）")
):
    """
    从CSV文件导入历史数据
    
    CSV格式要求：date, open, high, low, close, volume
    """
    try:
        # 保存上传的文件
        import tempfile
        import os
        
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            result = data_manager.import_from_csv(tmp_path, symbol)
            return result
        finally:
            os.unlink(tmp_path)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV导入失败: {str(e)}")


@router.post("/data/import/excel")
@rate_limit(requests_per_minute=10)
async def import_excel(file: UploadFile = File(...)):
    """
    从Excel文件导入历史数据
    
    每个sheet代表一只股票，sheet名为股票代码
    """
    try:
        import tempfile
        import os
        
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            result = data_manager.import_from_excel(tmp_path)
            return result
        finally:
            os.unlink(tmp_path)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel导入失败: {str(e)}")


@router.get("/data/export/csv/{symbol}")
@rate_limit(requests_per_minute=30)
async def export_csv(symbol: str):
    """
    导出股票历史数据为CSV
    """
    try:
        import tempfile
        
        output_path = data_manager.export_to_csv(symbol)
        
        from fastapi.responses import FileResponse
        return FileResponse(
            output_path,
            media_type='text/csv',
            filename=f"{symbol}_export.csv"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@router.post("/data/export/excel")
@rate_limit(requests_per_minute=30)
async def export_excel(symbols: List[str]):
    """
    导出多只股票到Excel
    
    请求体：["600519", "000858", "300750"]
    """
    try:
        output_path = data_manager.export_to_excel(symbols)
        
        from fastapi.responses import FileResponse
        return FileResponse(
            output_path,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename="stocks_export.xlsx"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@router.get("/data/quality/check")
@rate_limit(requests_per_minute=10)
async def check_data_quality(
    symbol: Optional[str] = Query(default=None, description="指定股票代码（不指定则检查所有）")
):
    """
    检查数据质量
    
    检查项：缺失值、价格异常、时间序列缺口、重复数据
    """
    try:
        result = data_manager.check_data_quality(symbol)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"质量检查失败: {str(e)}")


@router.post("/data/quality/fix")
@rate_limit(requests_per_minute=10)
async def fix_data_issues(
    symbol: str,
    issue_type: str = Query(..., pattern="^(duplicates|missing_values)$")
):
    """
    修复数据问题
    
    - duplicates: 删除重复数据
    - missing_values: 插值填充缺失值
    """
    try:
        result = data_manager.fix_data_issues(symbol, issue_type)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"修复失败: {str(e)}")


@router.get("/data/completeness/{symbol}")
@rate_limit(requests_per_minute=60)
@api_cache(ttl=300)
async def check_data_completeness(
    symbol: str,
    expected_days: int = Query(default=252, ge=1, le=500, description="预期交易日数")
):
    """
    检查数据完整性
    
    返回数据缺失情况
    """
    try:
        result = data_manager.check_missing_data(symbol, expected_days)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检查失败: {str(e)}")
