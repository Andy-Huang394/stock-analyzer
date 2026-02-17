"""
数据服务 - 协调数据获取和存储
"""
import pandas as pd
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import asyncio
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import logging

from app.data.fetcher import data_fetcher
from app.strategies.engine import StrategyEngine
from app.models.schemas import StockInfo, StockRealtime, AnalysisResult, MarketOverview, TrendDirection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DataService:
    """数据服务"""
    
    def __init__(self, strategy_engine: Optional[StrategyEngine] = None):
        self.fetcher = data_fetcher
        self.strategy = strategy_engine or StrategyEngine()
        self._realtime_data: pd.DataFrame = pd.DataFrame()
        self._last_update: Optional[datetime] = None
        self._analysis_results: List[AnalysisResult] = []
        
    def update_realtime_data(self) -> pd.DataFrame:
        """更新实时数据"""
        try:
            logger.info("更新实时行情数据...")
            self._realtime_data = self.fetcher.get_all_stocks()
            self._last_update = datetime.now()
            logger.info(f"成功更新 {len(self._realtime_data)} 只股票数据")
            return self._realtime_data
        except Exception as e:
            logger.error(f"更新实时数据失败: {e}")
            # 返回空数据或缓存
            if self._realtime_data.empty:
                self._realtime_data = self._get_mock_data()
            return self._realtime_data
    
    def _get_mock_data(self) -> pd.DataFrame:
        """获取模拟数据（当API失败时使用）"""
        logger.warning("使用模拟数据")
        mock_data = []
        base_stocks = [
            ('000001', '平安银行', 10.5, 2.5, 5000000),
            ('000002', '万科A', 15.2, -1.2, 3000000),
            ('600000', '浦发银行', 8.3, 0.8, 4000000),
            ('600519', '贵州茅台', 1680.0, 1.5, 200000),
            ('000858', '五粮液', 145.0, 0.5, 800000),
            ('002594', '比亚迪', 245.0, 3.2, 1200000),
            ('300750', '宁德时代', 185.0, -0.8, 900000),
            ('601318', '中国平安', 45.0, 1.2, 2500000),
            ('600036', '招商银行', 32.0, 0.5, 1800000),
            ('000333', '美的集团', 58.0, -0.3, 1100000),
        ]
        
        for symbol, name, price, change, volume in base_stocks:
            mock_data.append({
                'symbol': symbol,
                'name': name,
                'price': price,
                'change_percent': change,
                'change_amount': price * change / 100,
                'volume': volume,
                'amount': price * volume,
                'high': price * 1.02,
                'low': price * 0.98,
                'open': price * 0.995,
                'pre_close': price / (1 + change/100),
                'turnover': 2.5,
                'market': 'SH' if symbol.startswith('6') else 'SZ',
                'timestamp': datetime.now()
            })
        
        return pd.DataFrame(mock_data)
    
    def get_realtime_data(self) -> pd.DataFrame:
        """获取实时数据（自动更新）"""
        # 如果数据超过60秒，自动更新
        if (self._last_update is None or 
            datetime.now() - self._last_update > timedelta(seconds=60)):
            return self.update_realtime_data()
        return self._realtime_data
    
    def analyze_all_stocks(self, max_stocks: int = 100) -> List[AnalysisResult]:
        """
        分析所有股票
        
        Args:
            max_stocks: 最多分析多少只股票（按市值排序）
        """
        logger.info(f"开始分析股票，最多 {max_stocks} 只...")
        
        # 获取股票列表
        df = self.get_realtime_data()
        if df.empty:
            logger.warning("没有可用股票数据")
            return []
        
        # 按市值排序，取前N只
        if 'total_market_cap' in df.columns:
            df = df.nlargest(max_stocks, 'total_market_cap')
        else:
            df = df.head(max_stocks)
        
        results = []
        
        # 使用线程池并行获取历史数据和分析 - 增加并发数
        with ThreadPoolExecutor(max_workers=10) as executor:  # 从3增加到10
            futures = []
            for _, row in df.iterrows():
                symbol = row['symbol']
                name = row['name']
                future = executor.submit(self._analyze_single_stock_with_cache, symbol, name)
                futures.append((symbol, future))
            
            for symbol, future in futures:
                try:
                    result = future.result(timeout=15)  # 增加超时到15秒
                    if result:
                        results.append(result)
                except FutureTimeoutError:
                    logger.warning(f"分析股票 {symbol} 超时")
                except Exception as e:
                    logger.error(f"分析股票 {symbol} 失败: {e}")
        
        # 排序
        self._analysis_results = self.strategy.rank_stocks(results, sort_by='score')
        
        logger.info(f"分析完成，共 {len(results)} 只股票")
        return self._analysis_results
    
    def _analyze_single_stock_with_cache(self, symbol: str, name: str) -> Optional[AnalysisResult]:
        """分析单只股票（带缓存）"""
        from app.data.cache import data_cache
        
        # 1. 尝试从缓存获取分析结果
        cached = data_cache.get_analysis_cache(symbol, max_age_minutes=15)
        if cached:
            from app.models.schemas import AnalysisResult, TrendDirection, TechnicalSignal
            
            # 重建AnalysisResult对象
            signals = [TechnicalSignal(**s) for s in cached.get('signals', [])]
            
            return AnalysisResult(
                symbol=symbol,
                name=cached.get('name', name),
                price=cached.get('price', 0),
                change_percent=cached.get('change_percent', 0),
                total_score=cached.get('total_score', 0),
                trend_direction=TrendDirection(cached.get('trend_direction', 'neutral')),
                confidence=0.5,
                signals=signals,
                up_probability=cached.get('up_probability', 0.5),
                up_probability_1d=cached.get('up_probability_1d', 0.5),
                up_probability_7d=cached.get('up_probability_7d', 0.5),
                expected_return_1d=cached.get('expected_return_1d'),
                expected_return_7d=cached.get('expected_return_7d'),
                timestamp=datetime.now()
            )
        
        # 2. 缓存未命中，执行分析
        result = self._analyze_single_stock(symbol, name)
        
        # 3. 保存到缓存
        if result:
            data_cache.save_analysis_cache(symbol, result.model_dump())
        
        return result
    
    def _analyze_single_stock(self, symbol: str, name: str) -> Optional[AnalysisResult]:
        """分析单只股票"""
        try:
            # 获取历史数据
            df = self.fetcher.get_stock_history(symbol, days=60)  # 减少天数
            if df.empty or len(df) < 20:  # 降低门槛
                return None
            
            # 分析
            result = self.strategy.analyze_stock(df, symbol, name)
            return result
            
        except Exception as e:
            logger.error(f"分析 {symbol} 失败: {e}")
            return None
    
    def get_top_picks(self, n: int = 20, min_score: float = 60) -> List[AnalysisResult]:
        """获取推荐股票"""
        if not self._analysis_results:
            self.analyze_all_stocks()
        
        # 过滤高分股票
        filtered = [r for r in self._analysis_results if r.total_score >= min_score]
        return filtered[:n]
    
    def get_market_overview(self) -> MarketOverview:
        """获取市场概览"""
        df = self.get_realtime_data()
        
        if df.empty:
            # 返回空概览
            return MarketOverview(
                timestamp=datetime.now(),
                total_stocks=0,
                up_count=0,
                down_count=0,
                flat_count=0,
                avg_change=0,
                volume=0,
                top_gainers=[],
                top_losers=[],
                hot_sectors=[]
            )
        
        # 统计涨跌
        up_count = len(df[df['change_percent'] > 0])
        down_count = len(df[df['change_percent'] < 0])
        flat_count = len(df[df['change_percent'] == 0])
        
        # 平均涨跌幅
        avg_change = df['change_percent'].mean()
        
        # 总成交额
        volume = df['amount'].sum() if 'amount' in df.columns else 0
        
        # 涨跌停
        top_gainers_df = df.nlargest(10, 'change_percent')
        top_losers_df = df.nsmallest(10, 'change_percent')
        
        # 转换为AnalysisResult格式
        top_gainers = []
        for _, row in top_gainers_df.iterrows():
            top_gainers.append(AnalysisResult(
                symbol=row['symbol'],
                name=row['name'],
                price=float(row['price']),
                change_percent=float(row['change_percent']),
                total_score=0,
                trend_direction=TrendDirection.UP,
                confidence=0,
                signals=[],
                up_probability=0,
                timestamp=datetime.now()
            ))
        
        top_losers = []
        for _, row in top_losers_df.iterrows():
            top_losers.append(AnalysisResult(
                symbol=row['symbol'],
                name=row['name'],
                price=float(row['price']),
                change_percent=float(row['change_percent']),
                total_score=0,
                trend_direction=TrendDirection.DOWN,
                confidence=0,
                signals=[],
                up_probability=0,
                timestamp=datetime.now()
            ))
        
        # 热门板块（简化版）
        hot_sectors = []
        
        return MarketOverview(
            timestamp=datetime.now(),
            total_stocks=len(df),
            up_count=up_count,
            down_count=down_count,
            flat_count=flat_count,
            avg_change=float(avg_change),
            volume=float(volume),
            top_gainers=top_gainers,
            top_losers=top_losers,
            hot_sectors=hot_sectors
        )
    
    def search_stocks(self, query: str) -> List[StockInfo]:
        """搜索股票"""
        df = self.get_realtime_data()
        
        # 按代码或名称搜索
        mask = (
            df['symbol'].str.contains(query, case=False, na=False) |
            df['name'].str.contains(query, case=False, na=False)
        )
        
        results = []
        for _, row in df[mask].head(20).iterrows():
            results.append(StockInfo(
                symbol=row['symbol'],
                name=row['name'],
                industry=row.get('industry'),
                market=row.get('market')
            ))
        
        return results
    
    def get_stock_detail(self, symbol: str) -> Optional[Dict[str, Any]]:
        """获取股票详情"""
        try:
            # 实时数据
            df = self.get_realtime_data()
            stock_info = df[df['symbol'] == symbol]
            
            if stock_info.empty:
                return None
            
            info = stock_info.iloc[0].to_dict()
            
            # 历史数据
            history = self.fetcher.get_stock_history(symbol, days=60)
            
            # 分析结果
            analysis = None
            for result in self._analysis_results:
                if result.symbol == symbol:
                    analysis = result
                    break
            
            return {
                'info': info,
                'history': history.to_dict('records') if not history.empty else [],
                'analysis': analysis.dict() if analysis else None
            }
            
        except Exception as e:
            logger.error(f"获取股票详情失败 {symbol}: {e}")
            return None


# 全局数据服务实例
data_service = DataService()
