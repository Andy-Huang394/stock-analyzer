"""
数据管理模块 - 支持多数据库后端、导入导出、数据质量检查
参考 vnpy DataManager 实现
"""
import sqlite3
import pandas as pd
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timedelta
import json
import logging
from enum import Enum
from pathlib import Path

# 数据库驱动
import sqlalchemy
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

logger = logging.getLogger(__name__)


class DatabaseBackend(str, Enum):
    """数据库后端类型"""
    SQLITE = "sqlite"
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"


class DataManager:
    """
    数据管理器 - 统一的数据管理接口
    支持多种数据库后端，提供导入导出、数据质量检查功能
    """
    
    def __init__(self, backend: DatabaseBackend = DatabaseBackend.SQLITE, 
                 connection_string: Optional[str] = None):
        """
        初始化数据管理器
        
        Args:
            backend: 数据库后端类型
            connection_string: 数据库连接字符串
        """
        self.backend = backend
        self.connection_string = connection_string or self._get_default_connection()
        self.engine = self._create_engine()
        self._init_tables()
        
        logger.info(f"数据管理器初始化完成: {backend.value}")
    
    def _get_default_connection(self) -> str:
        """获取默认连接字符串"""
        if self.backend == DatabaseBackend.SQLITE:
            base_dir = Path(__file__).parent.parent.parent
            db_path = base_dir / "stock_data.db"
            return f"sqlite:///{db_path}"
        elif self.backend == DatabaseBackend.MYSQL:
            return "mysql+pymysql://user:password@localhost/stock_analyzer"
        elif self.backend == DatabaseBackend.POSTGRESQL:
            return "postgresql://user:password@localhost/stock_analyzer"
        else:
            raise ValueError(f"不支持的数据库后端: {self.backend}")
    
    def _create_engine(self):
        """创建数据库引擎"""
        try:
            if self.backend == DatabaseBackend.SQLITE:
                # SQLite 配置
                engine = create_engine(
                    self.connection_string,
                    poolclass=NullPool,
                    connect_args={'check_same_thread': False}
                )
            else:
                # MySQL/PostgreSQL 配置
                engine = create_engine(
                    self.connection_string,
                    pool_size=5,
                    max_overflow=10,
                    pool_timeout=30,
                    pool_recycle=3600
                )
            
            # 测试连接
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            return engine
            
        except Exception as e:
            logger.error(f"数据库连接失败: {e}")
            # 降级到 SQLite
            if self.backend != DatabaseBackend.SQLITE:
                logger.warning(f"降级到 SQLite")
                self.backend = DatabaseBackend.SQLITE
                self.connection_string = self._get_default_connection()
                return create_engine(self.connection_string, poolclass=NullPool)
            raise
    
    def _init_tables(self):
        """初始化数据表"""
        # 历史数据表
        history_sql = """
        CREATE TABLE IF NOT EXISTS stock_history (
            symbol VARCHAR(20) NOT NULL,
            date DATE NOT NULL,
            open DECIMAL(10, 2),
            high DECIMAL(10, 2),
            low DECIMAL(10, 2),
            close DECIMAL(10, 2),
            volume BIGINT,
            amount DECIMAL(15, 2),
            amplitude DECIMAL(5, 2),
            change_percent DECIMAL(5, 2),
            change_amount DECIMAL(10, 2),
            turnover DECIMAL(5, 2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, date)
        )
        """
        
        # 实时数据缓存表
        realtime_sql = """
        CREATE TABLE IF NOT EXISTS realtime_cache (
            symbol VARCHAR(20) PRIMARY KEY,
            name VARCHAR(100),
            price DECIMAL(10, 2),
            change_percent DECIMAL(5, 2),
            change_amount DECIMAL(10, 2),
            volume BIGINT,
            amount DECIMAL(15, 2),
            high DECIMAL(10, 2),
            low DECIMAL(10, 2),
            open DECIMAL(10, 2),
            pre_close DECIMAL(10, 2),
            turnover DECIMAL(5, 2),
            market VARCHAR(10),
            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
        
        # 分析结果缓存表
        analysis_sql = """
        CREATE TABLE IF NOT EXISTS analysis_cache (
            symbol VARCHAR(20) PRIMARY KEY,
            name VARCHAR(100),
            price DECIMAL(10, 2),
            change_percent DECIMAL(5, 2),
            total_score DECIMAL(5, 2),
            trend_direction VARCHAR(20),
            up_probability DECIMAL(5, 4),
            up_probability_1d DECIMAL(5, 4),
            up_probability_7d DECIMAL(5, 4),
            expected_return_1d DECIMAL(10, 4),
            expected_return_7d DECIMAL(10, 4),
            signals_json TEXT,
            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
        
        # 数据导入记录表
        import_sql = """
        CREATE TABLE IF NOT EXISTS import_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename VARCHAR(255),
            import_type VARCHAR(50),
            record_count INTEGER,
            success_count INTEGER,
            failed_count INTEGER,
            error_log TEXT,
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
        
        # 数据质量检查记录表
        quality_sql = """
        CREATE TABLE IF NOT EXISTS quality_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol VARCHAR(20),
            check_date DATE,
            check_type VARCHAR(50),
            issue_count INTEGER,
            details TEXT,
            fixed BOOLEAN DEFAULT FALSE,
            checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
        
        # 执行建表
        with self.engine.connect() as conn:
            conn.execute(text(history_sql))
            conn.execute(text(realtime_sql))
            conn.execute(text(analysis_sql))
            conn.execute(text(import_sql))
            conn.execute(text(quality_sql))
            conn.commit()
        
        # 创建索引
        self._create_indexes()
    
    def _create_indexes(self):
        """创建索引优化查询"""
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_history_date ON stock_history(date)",
            "CREATE INDEX IF NOT EXISTS idx_history_symbol ON stock_history(symbol)",
            "CREATE INDEX IF NOT EXISTS idx_realtime_cached ON realtime_cache(cached_at)",
            "CREATE INDEX IF NOT EXISTS idx_analysis_cached ON analysis_cache(cached_at)",
            "CREATE INDEX IF NOT EXISTS idx_quality_symbol ON quality_checks(symbol)",
        ]
        
        with self.engine.connect() as conn:
            for idx_sql in indexes:
                try:
                    conn.execute(text(idx_sql))
                except Exception as e:
                    logger.debug(f"索引创建跳过: {e}")
            conn.commit()
    
    # ==================== 数据导入导出 ====================
    
    def import_from_csv(self, file_path: str, symbol: Optional[str] = None) -> Dict[str, Any]:
        """
        从CSV导入历史数据
        
        支持的CSV格式:
        - date, open, high, low, close, volume
        - 日期格式: YYYY-MM-DD
        """
        try:
            logger.info(f"导入CSV文件: {file_path}")
            
            # 读取CSV
            df = pd.read_csv(file_path)
            
            # 标准化列名
            column_mapping = {
                'Date': 'date', '日期': 'date',
                'Open': 'open', '开盘': 'open',
                'High': 'high', '最高': 'high',
                'Low': 'low', '最低': 'low',
                'Close': 'close', '收盘': 'close', '收盘价': 'close',
                'Volume': 'volume', '成交量': 'volume', 'vol': 'volume',
                'Amount': 'amount', '成交额': 'amount',
                'Symbol': 'symbol', '代码': 'symbol'
            }
            df = df.rename(columns=column_mapping)
            
            # 检查必要列
            required_cols = ['date', 'open', 'high', 'low', 'close', 'volume']
            missing_cols = [col for col in required_cols if col not in df.columns]
            if missing_cols:
                raise ValueError(f"CSV缺少必要列: {missing_cols}")
            
            # 从文件名或传入参数获取symbol
            if 'symbol' not in df.columns:
                if symbol is None:
                    # 尝试从文件名提取
                    symbol = Path(file_path).stem.split('_')[0]
                df['symbol'] = symbol
            
            # 日期格式转换
            df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
            
            # 数据清洗
            df = self._clean_data(df)
            
            # 保存到数据库
            inserted = self._save_history_data(df)
            
            # 记录导入历史
            self._record_import(file_path, 'csv', len(df), inserted, 0, '')
            
            return {
                'success': True,
                'imported': inserted,
                'total': len(df),
                'symbol': symbol
            }
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"CSV导入失败: {error_msg}")
            self._record_import(file_path, 'csv', 0, 0, 0, error_msg)
            return {
                'success': False,
                'error': error_msg
            }
    
    def import_from_excel(self, file_path: str) -> Dict[str, Any]:
        """
        从Excel导入历史数据
        支持多sheet，每个sheet代表一只股票
        """
        try:
            logger.info(f"导入Excel文件: {file_path}")
            
            # 读取所有sheet
            xl = pd.ExcelFile(file_path)
            total_imported = 0
            results = []
            
            for sheet_name in xl.sheet_names:
                try:
                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                    
                    # 标准化列名（同CSV）
                    column_mapping = {
                        'Date': 'date', '日期': 'date',
                        'Open': 'open', '开盘': 'open',
                        'High': 'high', '最高': 'high',
                        'Low': 'low', '最低': 'low',
                        'Close': 'close', '收盘': 'close',
                        'Volume': 'volume', '成交量': 'volume',
                    }
                    df = df.rename(columns=column_mapping)
                    
                    # 使用sheet名作为symbol
                    df['symbol'] = sheet_name
                    
                    # 数据清洗和保存
                    df = self._clean_data(df)
                    inserted = self._save_history_data(df)
                    
                    total_imported += inserted
                    results.append({
                        'sheet': sheet_name,
                        'imported': inserted
                    })
                    
                except Exception as e:
                    results.append({
                        'sheet': sheet_name,
                        'error': str(e)
                    })
            
            success_count = len([r for r in results if 'error' not in r])
            self._record_import(
                file_path, 'excel', 
                sum(r.get('imported', 0) for r in results),
                success_count, 
                len(results) - success_count,
                ''
            )
            
            return {
                'success': True,
                'total_imported': total_imported,
                'sheets': results
            }
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Excel导入失败: {error_msg}")
            return {
                'success': False,
                'error': error_msg
            }
    
    def export_to_csv(self, symbol: str, output_path: Optional[str] = None) -> str:
        """
        导出股票历史数据到CSV
        
        Returns:
            导出的文件路径
        """
        try:
            # 查询数据
            df = self.get_stock_history(symbol)
            
            if df.empty:
                raise ValueError(f"没有找到 {symbol} 的历史数据")
            
            # 生成默认文件名
            if output_path is None:
                timestamp = datetime.now().strftime('%Y%m%d')
                output_path = f"{symbol}_{timestamp}.csv"
            
            # 导出CSV
            df.to_csv(output_path, index=False, encoding='utf-8-sig')
            
            logger.info(f"导出CSV成功: {output_path}, {len(df)} 条记录")
            return output_path
            
        except Exception as e:
            logger.error(f"CSV导出失败: {e}")
            raise
    
    def export_to_excel(self, symbols: List[str], output_path: Optional[str] = None) -> str:
        """
        导出多只股票到Excel，每个股票一个sheet
        """
        try:
            if output_path is None:
                timestamp = datetime.now().strftime('%Y%m%d')
                output_path = f"stocks_export_{timestamp}.xlsx"
            
            with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
                for symbol in symbols:
                    df = self.get_stock_history(symbol)
                    if not df.empty:
                        df.to_excel(writer, sheet_name=symbol, index=False)
            
            logger.info(f"导出Excel成功: {output_path}, {len(symbols)} 只股票")
            return output_path
            
        except Exception as e:
            logger.error(f"Excel导出失败: {e}")
            raise
    
    # ==================== 数据查询 ====================
    
    def get_stock_history(self, symbol: str, start_date: Optional[str] = None,
                         end_date: Optional[str] = None, limit: Optional[int] = None) -> pd.DataFrame:
        """
        获取股票历史数据
        
        Args:
            symbol: 股票代码
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)
            limit: 限制返回条数
        """
        try:
            query = "SELECT * FROM stock_history WHERE symbol = :symbol"
            params = {'symbol': symbol}
            
            if start_date:
                query += " AND date >= :start_date"
                params['start_date'] = start_date
            
            if end_date:
                query += " AND date <= :end_date"
                params['end_date'] = end_date
            
            query += " ORDER BY date"
            
            if limit:
                if self.backend == DatabaseBackend.SQLITE:
                    query += f" LIMIT {limit}"
                else:
                    query += f" LIMIT {limit}"
            
            with self.engine.connect() as conn:
                df = pd.read_sql_query(text(query), conn, params=params)
            
            if not df.empty:
                df['date'] = pd.to_datetime(df['date'])
            
            return df
            
        except Exception as e:
            logger.error(f"查询历史数据失败: {e}")
            return pd.DataFrame()
    
    def get_symbol_list(self) -> List[str]:
        """获取所有股票代码列表"""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(
                    "SELECT DISTINCT symbol FROM stock_history ORDER BY symbol"
                ))
                return [row[0] for row in result]
        except Exception as e:
            logger.error(f"获取股票列表失败: {e}")
            return []
    
    def get_date_range(self, symbol: str) -> Dict[str, Optional[str]]:
        """获取股票数据的时间范围"""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as count
                    FROM stock_history
                    WHERE symbol = :symbol
                """), {'symbol': symbol})
                
                row = result.fetchone()
                return {
                    'symbol': symbol,
                    'start_date': row[0],
                    'end_date': row[1],
                    'count': row[2]
                }
        except Exception as e:
            logger.error(f"获取时间范围失败: {e}")
            return {'symbol': symbol, 'start_date': None, 'end_date': None, 'count': 0}
    
    # ==================== 数据质量检查 ====================
    
    def check_data_quality(self, symbol: Optional[str] = None) -> Dict[str, Any]:
        """
        检查数据质量
        
        检查项:
        - 缺失值
        - 价格异常 (如收盘价为0)
        - 时间序列缺失
        - 数据重复
        """
        issues = []
        
        try:
            # 获取要检查的股票列表
            symbols = [symbol] if symbol else self.get_symbol_list()
            
            for sym in symbols:
                df = self.get_stock_history(sym)
                if df.empty:
                    continue
                
                # 检查缺失值
                null_counts = df.isnull().sum()
                if null_counts.any():
                    issues.append({
                        'symbol': sym,
                        'type': 'missing_values',
                        'details': null_counts[null_counts > 0].to_dict()
                    })
                
                # 检查价格异常
                price_issues = df[
                    (df['close'] <= 0) | 
                    (df['open'] <= 0) | 
                    (df['high'] <= 0) | 
                    (df['low'] <= 0)
                ]
                if not price_issues.empty:
                    issues.append({
                        'symbol': sym,
                        'type': 'invalid_prices',
                        'count': len(price_issues),
                        'dates': price_issues['date'].tolist()
                    })
                
                # 检查时间序列连续性
                date_gaps = self._check_date_gaps(df)
                if date_gaps:
                    issues.append({
                        'symbol': sym,
                        'type': 'date_gaps',
                        'gaps': date_gaps
                    })
                
                # 检查重复数据
                duplicates = df[df.duplicated(['date'], keep=False)]
                if not duplicates.empty:
                    issues.append({
                        'symbol': sym,
                        'type': 'duplicates',
                        'count': len(duplicates),
                        'dates': duplicates['date'].unique().tolist()
                    })
            
            # 保存检查结果
            self._save_quality_check(symbol, issues)
            
            return {
                'success': True,
                'total_issues': len(issues),
                'issues': issues
            }
            
        except Exception as e:
            logger.error(f"数据质量检查失败: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def fix_data_issues(self, symbol: str, issue_type: str) -> Dict[str, Any]:
        """
        修复数据问题
        """
        try:
            if issue_type == 'duplicates':
                # 删除重复数据，保留最新
                with self.engine.connect() as conn:
                    conn.execute(text("""
                        DELETE FROM stock_history
                        WHERE rowid NOT IN (
                            SELECT MIN(rowid)
                            FROM stock_history
                            WHERE symbol = :symbol
                            GROUP BY date
                        )
                        AND symbol = :symbol
                    """), {'symbol': symbol})
                    conn.commit()
                
                return {'success': True, 'message': '重复数据已删除'}
            
            elif issue_type == 'missing_values':
                # 使用插值填充缺失值
                df = self.get_stock_history(symbol)
                df = df.set_index('date')
                
                # 插值填充
                for col in ['open', 'high', 'low', 'close', 'volume']:
                    if col in df.columns:
                        df[col] = df[col].interpolate(method='linear')
                
                # 保存修复后的数据
                df = df.reset_index()
                self._save_history_data(df, overwrite=True)
                
                return {'success': True, 'message': '缺失值已插值填充'}
            
            else:
                return {'success': False, 'message': f'不支持的修复类型: {issue_type}'}
                
        except Exception as e:
            logger.error(f"修复数据失败: {e}")
            return {'success': False, 'error': str(e)}
    
    # ==================== 数据补全 ====================
    
    def check_missing_data(self, symbol: str, expected_days: int = 252) -> Dict[str, Any]:
        """
        检查缺失的数据
        
        Args:
            symbol: 股票代码
            expected_days: 预期应有的交易日数量（默认一年）
        """
        try:
            date_range = self.get_date_range(symbol)
            
            if not date_range['count']:
                return {
                    'symbol': symbol,
                    'has_data': False,
                    'missing_count': expected_days
                }
            
            # 计算缺失比例
            actual_days = date_range['count']
            missing_count = max(0, expected_days - actual_days)
            completeness = actual_days / expected_days if expected_days > 0 else 0
            
            return {
                'symbol': symbol,
                'has_data': True,
                'start_date': date_range['start_date'],
                'end_date': date_range['end_date'],
                'actual_days': actual_days,
                'expected_days': expected_days,
                'missing_count': missing_count,
                'completeness': round(completeness, 2)
            }
            
        except Exception as e:
            logger.error(f"检查缺失数据失败: {e}")
            return {'symbol': symbol, 'error': str(e)}
    
    def get_database_stats(self) -> Dict[str, Any]:
        """获取数据库统计信息"""
        try:
            stats = {
                'backend': self.backend.value,
                'connection': self.connection_string
            }
            
            with self.engine.connect() as conn:
                # 股票数量
                result = conn.execute(text(
                    "SELECT COUNT(DISTINCT symbol) FROM stock_history"
                ))
                stats['total_symbols'] = result.scalar()
                
                # 总记录数
                result = conn.execute(text("SELECT COUNT(*) FROM stock_history"))
                stats['total_records'] = result.scalar()
                
                # 日期范围
                result = conn.execute(text(
                    "SELECT MIN(date), MAX(date) FROM stock_history"
                ))
                row = result.fetchone()
                stats['date_range'] = {
                    'min': row[0],
                    'max': row[1]
                }
                
                # 数据库大小（SQLite）
                if self.backend == DatabaseBackend.SQLITE:
                    import os
                    db_path = self.connection_string.replace('sqlite:///', '')
                    if os.path.exists(db_path):
                        size_mb = os.path.getsize(db_path) / 1024 / 1024
                        stats['db_size_mb'] = round(size_mb, 2)
            
            return stats
            
        except Exception as e:
            logger.error(f"获取统计信息失败: {e}")
            return {'error': str(e)}
    
    # ==================== 辅助方法 ====================
    
    def _clean_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """清洗数据"""
        # 删除全空行
        df = df.dropna(how='all')
        
        # 删除价格异常行
        df = df[
            (df['close'] > 0) & 
            (df['open'] > 0) & 
            (df['high'] > 0) & 
            (df['low'] > 0)
        ]
        
        # 确保数值类型
        numeric_cols = ['open', 'high', 'low', 'close', 'volume']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        return df.dropna(subset=numeric_cols)
    
    def _save_history_data(self, df: pd.DataFrame, overwrite: bool = False) -> int:
        """保存历史数据到数据库"""
        if df.empty:
            return 0
        
        # 准备数据
        columns = ['symbol', 'date', 'open', 'high', 'low', 'close', 
                   'volume', 'amount', 'amplitude', 'change_percent', 
                   'change_amount', 'turnover']
        
        # 确保所有列存在
        for col in columns:
            if col not in df.columns:
                df[col] = None
        
        df = df[columns]
        
        with self.engine.connect() as conn:
            if overwrite:
                # 删除现有数据
                symbols = df['symbol'].unique()
                for symbol in symbols:
                    conn.execute(text(
                        "DELETE FROM stock_history WHERE symbol = :symbol"
                    ), {'symbol': symbol})
            
            # 插入数据
            df.to_sql('stock_history', conn, if_exists='append', index=False)
            conn.commit()
        
        return len(df)
    
    def _check_date_gaps(self, df: pd.DataFrame) -> List[Dict]:
        """检查日期缺口"""
        if df.empty or len(df) < 2:
            return []
        
        df = df.sort_values('date')
        df['date'] = pd.to_datetime(df['date'])
        
        # 计算日期差
        df['date_diff'] = df['date'].diff().dt.days
        
        # 找出大于5天的缺口（排除周末）
        gaps = df[df['date_diff'] > 5]
        
        return [
            {
                'from': (row['date'] - pd.Timedelta(days=int(row['date_diff']))).strftime('%Y-%m-%d'),
                'to': row['date'].strftime('%Y-%m-%d'),
                'days': int(row['date_diff'])
            }
            for _, row in gaps.iterrows()
        ]
    
    def _record_import(self, filename: str, import_type: str, 
                       record_count: int, success_count: int, 
                       failed_count: int, error_log: str):
        """记录导入历史"""
        try:
            with self.engine.connect() as conn:
                conn.execute(text("""
                    INSERT INTO import_history 
                    (filename, import_type, record_count, success_count, failed_count, error_log)
                    VALUES (:filename, :import_type, :record_count, :success_count, :failed_count, :error_log)
                """), {
                    'filename': filename,
                    'import_type': import_type,
                    'record_count': record_count,
                    'success_count': success_count,
                    'failed_count': failed_count,
                    'error_log': error_log[:1000]  # 限制长度
                })
                conn.commit()
        except Exception as e:
            logger.error(f"记录导入历史失败: {e}")
    
    def _save_quality_check(self, symbol: Optional[str], issues: List[Dict]):
        """保存质量检查结果"""
        try:
            with self.engine.connect() as conn:
                for issue in issues:
                    conn.execute(text("""
                        INSERT INTO quality_checks 
                        (symbol, check_date, check_type, issue_count, details)
                        VALUES (:symbol, :check_date, :check_type, :issue_count, :details)
                    """), {
                        'symbol': issue['symbol'],
                        'check_date': datetime.now().strftime('%Y-%m-%d'),
                        'check_type': issue['type'],
                        'issue_count': issue.get('count', 1),
                        'details': json.dumps(issue.get('details', {}), ensure_ascii=False)[:500]
                    })
                conn.commit()
        except Exception as e:
            logger.error(f"保存质量检查结果失败: {e}")


# 全局实例
data_manager = DataManager()
