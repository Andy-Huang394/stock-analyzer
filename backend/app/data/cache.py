"""
数据缓存管理器
使用SQLite本地缓存，支持Redis作为一级缓存（自动降级）
"""
import sqlite3
import pandas as pd
from typing import Optional, List
from datetime import datetime, timedelta
import json
import logging

from app.core.config import settings

try:
    from app.data.redis_cache import redis_cache, REDIS_AVAILABLE
except ImportError:
    REDIS_AVAILABLE = False
    redis_cache = None

logger = logging.getLogger(__name__)


class DataCache:
    """数据缓存管理器 - 支持Redis + SQLite双层缓存"""
    
    def __init__(self, db_path: str = "./stock_cache.db"):
        self.db_path = db_path
        self._use_redis = settings.REDIS_ENABLED and REDIS_AVAILABLE
        self._init_db()
        
        if self._use_redis and redis_cache:
            logger.info("数据缓存: 启用Redis + SQLite双层缓存")
        else:
            logger.info("数据缓存: 仅使用SQLite缓存")
    
    def _init_db(self):
        """初始化数据库表"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 历史数据缓存表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS stock_history (
                    symbol TEXT NOT NULL,
                    date TEXT NOT NULL,
                    open REAL,
                    close REAL,
                    high REAL,
                    low REAL,
                    volume REAL,
                    amount REAL,
                    amplitude REAL,
                    change_percent REAL,
                    change_amount REAL,
                    turnover REAL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (symbol, date)
                )
            ''')
            
            # 分析结果缓存表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS analysis_cache (
                    symbol TEXT PRIMARY KEY,
                    name TEXT,
                    price REAL,
                    change_percent REAL,
                    total_score REAL,
                    trend_direction TEXT,
                    up_probability REAL,
                    up_probability_1d REAL,
                    up_probability_7d REAL,
                    expected_return_1d REAL,
                    expected_return_7d REAL,
                    signals_json TEXT,
                    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 缓存元数据表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS cache_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 添加索引优化查询性能
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_history_symbol_date 
                ON stock_history(symbol, date)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_history_date 
                ON stock_history(date)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_analysis_cached_at 
                ON analysis_cache(cached_at)
            ''')
            
            conn.commit()
            logger.info("数据库初始化完成")
    
    def get_stock_history(self, symbol: str, days: int = 120) -> Optional[pd.DataFrame]:
        """获取缓存的历史数据 - 优先Redis，降级SQLite"""
        # 1. 尝试从Redis获取
        if self._use_redis and redis_cache:
            try:
                cached = redis_cache.get_history(symbol)
                if cached is not None:
                    df = pd.DataFrame(cached)
                    if len(df) >= days:
                        logger.debug(f"Redis缓存命中 {symbol} 历史数据")
                        return df
            except Exception as e:
                logger.debug(f"Redis获取失败，降级到SQLite: {e}")
        
        # 2. 从SQLite获取
        try:
            with sqlite3.connect(self.db_path) as conn:
                # 检查数据新鲜度
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT MAX(date) FROM stock_history 
                    WHERE symbol = ? AND date >= date('now', '-7 days')
                ''', (symbol,))
                
                result = cursor.fetchone()
                if not result or not result[0]:
                    return None
                
                # 获取数据
                query = '''
                    SELECT * FROM stock_history 
                    WHERE symbol = ? 
                    ORDER BY date DESC 
                    LIMIT ?
                '''
                df = pd.read_sql_query(query, conn, params=(symbol, days))
                
                if len(df) < 20:  # 数据不足
                    return None
                
                df['date'] = pd.to_datetime(df['date'])
                df = df.sort_values('date').reset_index(drop=True)
                
                # 同步到Redis
                if self._use_redis and redis_cache:
                    try:
                        redis_cache.cache_history(symbol, df.to_dict('records'))
                    except Exception as e:
                        logger.debug(f"同步到Redis失败: {e}")
                
                logger.debug(f"从SQLite缓存获取 {symbol} 历史数据: {len(df)} 条")
                return df
                
        except Exception as e:
            logger.error(f"读取缓存失败: {e}")
            return None
    
    def save_stock_history(self, symbol: str, df: pd.DataFrame):
        """保存历史数据到缓存 - Redis + SQLite"""
        try:
            if df.empty:
                return
            
            # 1. 保存到Redis（短时间缓存）
            if self._use_redis and redis_cache:
                try:
                    redis_cache.cache_history(symbol, df.to_dict('records'))
                except Exception as e:
                    logger.debug(f"保存到Redis失败: {e}")
            
            # 2. 保存到SQLite（长时间存储）
            with sqlite3.connect(self.db_path) as conn:
                # 准备数据
                data_to_save = df.copy()
                if 'symbol' not in data_to_save.columns:
                    data_to_save['symbol'] = symbol
                
                # 确保日期格式正确
                if pd.api.types.is_datetime64_any_dtype(data_to_save['date']):
                    data_to_save['date'] = data_to_save['date'].dt.strftime('%Y-%m-%d')
                
                # 只保留需要的列
                columns = ['symbol', 'date', 'open', 'close', 'high', 'low', 
                          'volume', 'amount', 'amplitude', 'change_percent', 
                          'change_amount', 'turnover']
                
                # 过滤已存在的记录
                cursor = conn.cursor()
                cursor.execute('SELECT date FROM stock_history WHERE symbol = ?', (symbol,))
                existing_dates = set(row[0] for row in cursor.fetchall())
                
                new_data = data_to_save[~data_to_save['date'].isin(existing_dates)]
                
                if not new_data.empty:
                    new_data = new_data[columns]
                    new_data.to_sql('stock_history', conn, if_exists='append', index=False)
                    logger.debug(f"缓存 {symbol} 新增 {len(new_data)} 条数据")
                
        except Exception as e:
            logger.error(f"保存缓存失败: {e}")
    
    def get_analysis_cache(self, symbol: str, max_age_minutes: int = 15) -> Optional[dict]:
        """获取缓存的分析结果 - 优先Redis，降级SQLite"""
        # 1. 尝试从Redis获取（更快速）
        if self._use_redis and redis_cache:
            try:
                cached = redis_cache.get_analysis(symbol)
                if cached is not None:
                    # 检查Redis中的缓存时间
                    redis_ttl = redis_cache.ttl(symbol, prefix="analysis")
                    if redis_ttl > 0:
                        logger.debug(f"Redis分析缓存命中: {symbol}")
                        return cached
            except Exception as e:
                logger.debug(f"Redis获取失败，降级到SQLite: {e}")
        
        # 2. 从SQLite获取
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM analysis_cache 
                    WHERE symbol = ? 
                    AND cached_at > datetime('now', '-{} minutes')
                '''.format(max_age_minutes), (symbol,))
                
                row = cursor.fetchone()
                if row:
                    columns = [desc[0] for desc in cursor.description]
                    result = dict(zip(columns, row))
                    result['signals'] = json.loads(result.pop('signals_json', '[]'))
                    
                    # 同步到Redis
                    if self._use_redis and redis_cache:
                        try:
                            redis_cache.cache_analysis(symbol, result, ttl=max_age_minutes*60)
                        except Exception as e:
                            logger.debug(f"同步到Redis失败: {e}")
                    
                    return result
                return None
                
        except Exception as e:
            logger.error(f"读取分析缓存失败: {e}")
            return None
    
    def save_analysis_cache(self, symbol: str, data: dict):
        """保存分析结果到缓存 - Redis + SQLite"""
        try:
            # 1. 保存到Redis（快速访问）
            if self._use_redis and redis_cache:
                try:
                    redis_cache.cache_analysis(symbol, data, ttl=900)  # 15分钟
                except Exception as e:
                    logger.debug(f"保存到Redis失败: {e}")
            
            # 2. 保存到SQLite（持久化）
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # 将signals转为JSON
                signals_json = json.dumps(data.get('signals', []))
                
                cursor.execute('''
                    INSERT OR REPLACE INTO analysis_cache (
                        symbol, name, price, change_percent, total_score,
                        trend_direction, up_probability, up_probability_1d, up_probability_7d,
                        expected_return_1d, expected_return_7d, signals_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    symbol, data.get('name'), data.get('price'), 
                    data.get('change_percent'), data.get('total_score'),
                    data.get('trend_direction'), data.get('up_probability'),
                    data.get('up_probability_1d'), data.get('up_probability_7d'),
                    data.get('expected_return_1d'), data.get('expected_return_7d'),
                    signals_json
                ))
                
                conn.commit()
                
        except Exception as e:
            logger.error(f"保存分析缓存失败: {e}")
    
    def clear_old_cache(self, days: int = 30):
        """清理旧缓存"""
        try:
            # 清理SQLite旧数据
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # 清理旧的历史数据
                cursor.execute('''
                    DELETE FROM stock_history 
                    WHERE date < date('now', '-{} days')
                '''.format(days))
                history_deleted = cursor.rowcount
                
                # 清理旧的分析缓存
                cursor.execute('''
                    DELETE FROM analysis_cache 
                    WHERE cached_at < datetime('now', '-1 day')
                ''')
                analysis_deleted = cursor.rowcount
                
                conn.commit()
                
                # 执行VACUUM优化数据库
                cursor.execute('VACUUM')
                
                logger.info(f"旧缓存清理完成: 历史数据 {history_deleted} 条, 分析缓存 {analysis_deleted} 条")
                
        except Exception as e:
            logger.error(f"清理缓存失败: {e}")
    
    def get_cache_stats(self) -> dict:
        """获取缓存统计"""
        stats = {
            'redis_enabled': self._use_redis,
            'redis_available': REDIS_AVAILABLE,
            'sqlite': {}
        }
        
        # Redis状态
        if self._use_redis and redis_cache:
            stats['redis'] = redis_cache.health_check()
        
        # SQLite统计
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                cursor.execute('SELECT COUNT(DISTINCT symbol) FROM stock_history')
                stats['sqlite']['history_symbols'] = cursor.fetchone()[0]
                
                cursor.execute('SELECT COUNT(*) FROM stock_history')
                stats['sqlite']['history_records'] = cursor.fetchone()[0]
                
                cursor.execute('SELECT COUNT(*) FROM analysis_cache')
                stats['sqlite']['analysis_cached'] = cursor.fetchone()[0]
                
                cursor.execute('PRAGMA page_count')
                page_count = cursor.fetchone()[0]
                cursor.execute('PRAGMA page_size')
                page_size = cursor.fetchone()[0]
                stats['sqlite']['db_size_mb'] = round(page_count * page_size / 1024 / 1024, 2)
                
        except Exception as e:
            logger.error(f"获取缓存统计失败: {e}")
            stats['sqlite']['error'] = str(e)
        
        return stats
    
    def invalidate_symbol(self, symbol: str):
        """使指定股票的缓存失效"""
        # 清除Redis缓存
        if self._use_redis and redis_cache:
            try:
                redis_cache.delete(symbol, prefix="analysis")
                redis_cache.delete(symbol, prefix="history")
            except Exception as e:
                logger.debug(f"清除Redis缓存失败: {e}")
        
        # 清除SQLite分析缓存
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM analysis_cache WHERE symbol = ?', (symbol,))
                conn.commit()
        except Exception as e:
            logger.error(f"清除SQLite缓存失败: {e}")


# 全局缓存实例
data_cache = DataCache()
