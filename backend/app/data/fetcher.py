"""
A股数据获取模块 - 使用akshare
"""
import akshare as ak
import pandas as pd
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import asyncio
from functools import lru_cache
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DataFetcher:
    """数据获取器"""
    
    def __init__(self):
        self._stock_list_cache: Optional[pd.DataFrame] = None
        self._cache_time: Optional[datetime] = None
        self._cache_duration = timedelta(minutes=60)
    
    def _is_cache_valid(self) -> bool:
        """检查缓存是否有效"""
        if self._stock_list_cache is None or self._cache_time is None:
            return False
        return datetime.now() - self._cache_time < self._cache_duration
    
    def get_all_stocks(self) -> pd.DataFrame:
        """
        获取所有A股股票列表
        """
        if self._is_cache_valid():
            return self._stock_list_cache
        
        try:
            logger.info("正在获取A股股票列表...")
            # 获取沪A股
            sh_stocks = ak.stock_sh_a_spot_em()
            sh_stocks['market'] = 'SH'
            
            # 获取深A股
            sz_stocks = ak.stock_sz_a_spot_em()
            sz_stocks['market'] = 'SZ'
            
            # 获取北交所
            bj_stocks = ak.stock_bj_a_spot_em()
            bj_stocks['market'] = 'BJ'
            
            # 合并
            all_stocks = pd.concat([sh_stocks, sz_stocks, bj_stocks], ignore_index=True)
            
            # 标准化列名
            column_mapping = {
                '代码': 'symbol',
                '名称': 'name',
                '最新价': 'price',
                '涨跌幅': 'change_percent',
                '涨跌额': 'change_amount',
                '成交量': 'volume',
                '成交额': 'amount',
                '最高': 'high',
                '最低': 'low',
                '今开': 'open',
                '昨收': 'pre_close',
                '换手率': 'turnover',
                '市盈率-动态': 'pe',
                '市净率': 'pb',
                '总市值': 'total_market_cap',
                '流通市值': 'float_market_cap',
            }
            
            all_stocks = all_stocks.rename(columns=column_mapping)
            
            # 过滤ST股票（可选）
            all_stocks = all_stocks[~all_stocks['name'].str.contains('ST', na=False)]
            
            # 过滤涨跌停（可选，保留正常交易股票）
            all_stocks = all_stocks[all_stocks['volume'] > 0]
            
            # 缓存
            self._stock_list_cache = all_stocks
            self._cache_time = datetime.now()
            
            logger.info(f"成功获取 {len(all_stocks)} 只股票")
            return all_stocks
            
        except Exception as e:
            logger.error(f"获取股票列表失败: {e}")
            if self._stock_list_cache is not None:
                logger.warning("使用缓存数据")
                return self._stock_list_cache
            raise
    
    def get_stock_history(self, symbol: str, days: int = 120) -> pd.DataFrame:
        """
        获取单只股票历史数据（带缓存）
        """
        from app.data.cache import data_cache
        
        # 1. 先尝试从缓存获取
        cached_df = data_cache.get_stock_history(symbol, days)
        if cached_df is not None and len(cached_df) >= days * 0.8:
            logger.debug(f"使用缓存数据: {symbol}")
            return cached_df
        
        # 2. 缓存未命中，从API获取
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days + 30)
            
            df = ak.stock_zh_a_hist(
                symbol=symbol,
                period="daily",
                start_date=start_date.strftime("%Y%m%d"),
                end_date=end_date.strftime("%Y%m%d"),
                adjust="qfq"
            )
            
            if df.empty:
                return pd.DataFrame()
            
            # 标准化列名
            column_mapping = {
                '日期': 'date',
                '股票代码': 'symbol',
                '开盘': 'open',
                '收盘': 'close',
                '最高': 'high',
                '最低': 'low',
                '成交量': 'volume',
                '成交额': 'amount',
                '振幅': 'amplitude',
                '涨跌幅': 'change_percent',
                '涨跌额': 'change_amount',
                '换手率': 'turnover'
            }
            df = df.rename(columns=column_mapping)
            
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date').reset_index(drop=True)
            df = df.tail(days)
            
            # 3. 保存到缓存
            data_cache.save_stock_history(symbol, df)
            
            return df
            
        except Exception as e:
            logger.error(f"获取股票 {symbol} 历史数据失败: {e}")
            # 出错时尝试返回缓存数据（即使旧数据）
            if cached_df is not None:
                logger.warning(f"使用旧缓存数据: {symbol}")
                return cached_df
            return pd.DataFrame()
    
    def get_realtime_quotes(self, symbols: Optional[List[str]] = None) -> pd.DataFrame:
        """
        获取实时行情
        
        Args:
            symbols: 指定股票代码列表，None则获取全部
        """
        try:
            df = self.get_all_stocks()
            
            if symbols:
                df = df[df['symbol'].isin(symbols)]
            
            # 添加时间戳
            df['timestamp'] = datetime.now()
            
            return df
            
        except Exception as e:
            logger.error(f"获取实时行情失败: {e}")
            return pd.DataFrame()
    
    def get_sector_data(self) -> pd.DataFrame:
        """获取板块/行业数据"""
        try:
            # 获取行业板块
            df = ak.stock_sector_spot(symbol="行业板块")
            return df
        except Exception as e:
            logger.error(f"获取板块数据失败: {e}")
            return pd.DataFrame()
    
    def get_index_data(self) -> Dict[str, Any]:
        """获取大盘指数数据"""
        try:
            indices = {}
            
            # 上证指数
            sh_index = ak.index_zh_a_hist(symbol="000001", period="daily")
            if not sh_index.empty:
                latest = sh_index.iloc[-1]
                indices['SH'] = {
                    'name': '上证指数',
                    'price': float(latest['收盘']),
                    'change': float(latest['涨跌额']),
                    'change_percent': float(latest['涨跌幅'])
                }
            
            # 深证成指
            sz_index = ak.index_zh_a_hist(symbol="399001", period="daily")
            if not sz_index.empty:
                latest = sz_index.iloc[-1]
                indices['SZ'] = {
                    'name': '深证成指',
                    'price': float(latest['收盘']),
                    'change': float(latest['涨跌额']),
                    'change_percent': float(latest['涨跌幅'])
                }
            
            # 创业板指
            cy_index = ak.index_zh_a_hist(symbol="399006", period="daily")
            if not cy_index.empty:
                latest = cy_index.iloc[-1]
                indices['CY'] = {
                    'name': '创业板指',
                    'price': float(latest['收盘']),
                    'change': float(latest['涨跌额']),
                    'change_percent': float(latest['涨跌幅'])
                }
            
            return indices
            
        except Exception as e:
            logger.error(f"获取指数数据失败: {e}")
            return {}


# 全局数据获取器实例
data_fetcher = DataFetcher()
