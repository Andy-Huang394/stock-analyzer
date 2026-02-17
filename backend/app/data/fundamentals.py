"""
基本面数据获取模块
获取股票基本面数据（PE/PB/ROE等），支持多因子分析
"""
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict

import pandas as pd

try:
    import akshare as ak
    AKSHARE_AVAILABLE = True
except ImportError:
    AKSHARE_AVAILABLE = False
    ak = None

from app.core.config import settings

try:
    from app.data.redis_cache import redis_cache, REDIS_AVAILABLE
except ImportError:
    REDIS_AVAILABLE = False
    redis_cache = None

logger = logging.getLogger(__name__)


@dataclass
class FundamentalData:
    """基本面数据"""
    symbol: str
    name: str
    
    # 估值指标
    pe_ttm: Optional[float] = None  # 市盈率TTM
    pe_lyr: Optional[float] = None  # 市盈率(静态)
    pb: Optional[float] = None      # 市净率
    ps_ttm: Optional[float] = None  # 市销率TTM
    pcf: Optional[float] = None     # 市现率
    
    # 盈利能力
    roe: Optional[float] = None         # 净资产收益率
    roe_diluted: Optional[float] = None # 摊薄ROE
    roa: Optional[float] = None         # 总资产收益率
    gross_margin: Optional[float] = None  # 毛利率
    net_margin: Optional[float] = None    # 净利率
    
    # 成长性
    revenue_growth: Optional[float] = None    # 营收增长率
    profit_growth: Optional[float] = None     # 净利润增长率
    
    # 财务健康
    debt_ratio: Optional[float] = None        # 资产负债率
    current_ratio: Optional[float] = None     # 流动比率
    quick_ratio: Optional[float] = None       # 速动比率
    
    # 现金流
    operating_cash_flow: Optional[float] = None   # 经营现金流
    free_cash_flow: Optional[float] = None        # 自由现金流
    
    # 分红
    dividend_yield: Optional[float] = None    # 股息率
    dividend_ratio: Optional[float] = None    # 分红率
    
    # 市值
    total_market_cap: Optional[float] = None  # 总市值
    float_market_cap: Optional[float] = None  # 流通市值
    
    # 行业
    industry: Optional[str] = None
    
    # 更新时间
    updated_at: datetime = None
    
    def __post_init__(self):
        if self.updated_at is None:
            self.updated_at = datetime.now()
    
    def to_dict(self) -> dict:
        """转换为字典"""
        data = asdict(self)
        data['updated_at'] = self.updated_at.isoformat() if self.updated_at else None
        return data
    
    def calculate_value_score(self) -> float:
        """
        计算价值因子得分 (0-100)
        基于PE、PB、股息率等估值指标
        """
        score = 50.0  # 基础分
        
        # PE评分 (越低越好)
        if self.pe_ttm is not None:
            if self.pe_ttm < 10:
                score += 20
            elif self.pe_ttm < 20:
                score += 10
            elif self.pe_ttm > 50:
                score -= 15
            elif self.pe_ttm > 100:
                score -= 25
        
        # PB评分 (越低越好)
        if self.pb is not None:
            if self.pb < 1:
                score += 15
            elif self.pb < 2:
                score += 10
            elif self.pb > 5:
                score -= 10
            elif self.pb > 10:
                score -= 20
        
        # 股息率评分 (越高越好)
        if self.dividend_yield is not None:
            if self.dividend_yield > 0.05:
                score += 15
            elif self.dividend_yield > 0.03:
                score += 10
            elif self.dividend_yield > 0.02:
                score += 5
        
        return max(0, min(100, score))
    
    def calculate_quality_score(self) -> float:
        """
        计算质量因子得分 (0-100)
        基于ROE、ROA、利润率等质量指标
        """
        score = 50.0
        
        # ROE评分 (越高越好)
        if self.roe is not None:
            if self.roe > 0.20:
                score += 20
            elif self.roe > 0.15:
                score += 15
            elif self.roe > 0.10:
                score += 10
            elif self.roe < 0.05:
                score -= 15
            elif self.roe < 0:
                score -= 25
        
        # ROA评分
        if self.roa is not None:
            if self.roa > 0.10:
                score += 10
            elif self.roa < 0:
                score -= 15
        
        # 毛利率评分
        if self.gross_margin is not None:
            if self.gross_margin > 0.50:
                score += 15
            elif self.gross_margin > 0.30:
                score += 10
            elif self.gross_margin < 0.10:
                score -= 10
        
        # 净利率评分
        if self.net_margin is not None:
            if self.net_margin > 0.20:
                score += 10
            elif self.net_margin < 0:
                score -= 15
        
        return max(0, min(100, score))
    
    def calculate_growth_score(self) -> float:
        """
        计算成长因子得分 (0-100)
        基于营收和利润增长率
        """
        score = 50.0
        
        # 营收增长评分
        if self.revenue_growth is not None:
            if self.revenue_growth > 0.50:
                score += 20
            elif self.revenue_growth > 0.30:
                score += 15
            elif self.revenue_growth > 0.15:
                score += 10
            elif self.revenue_growth < 0:
                score -= 20
        
        # 利润增长评分
        if self.profit_growth is not None:
            if self.profit_growth > 0.50:
                score += 20
            elif self.profit_growth > 0.30:
                score += 15
            elif self.profit_growth > 0.15:
                score += 10
            elif self.profit_growth < 0:
                score -= 20
        
        return max(0, min(100, score))
    
    def calculate_fundamental_score(self) -> dict:
        """
        计算综合基本面得分
        返回多维度评分
        """
        value_score = self.calculate_value_score()
        quality_score = self.calculate_quality_score()
        growth_score = self.calculate_growth_score()
        
        # 综合得分 (价值40% + 质量35% + 成长25%)
        total_score = (
            value_score * 0.40 +
            quality_score * 0.35 +
            growth_score * 0.25
        )
        
        return {
            "total_score": round(total_score, 2),
            "value_score": round(value_score, 2),
            "quality_score": round(quality_score, 2),
            "growth_score": round(growth_score, 2),
            "pe_level": self._get_pe_level(),
            "pb_level": self._get_pb_level(),
            "roe_level": self._get_roe_level()
        }
    
    def _get_pe_level(self) -> str:
        """PE水平评估"""
        if self.pe_ttm is None:
            return "unknown"
        if self.pe_ttm < 0:
            return "loss"
        elif self.pe_ttm < 15:
            return "undervalued"
        elif self.pe_ttm < 30:
            return "fair"
        elif self.pe_ttm < 50:
            return "overvalued"
        else:
            return "highly_overvalued"
    
    def _get_pb_level(self) -> str:
        """PB水平评估"""
        if self.pb is None:
            return "unknown"
        if self.pb < 1:
            return "undervalued"
        elif self.pb < 3:
            return "fair"
        elif self.pb < 5:
            return "overvalued"
        else:
            return "highly_overvalued"
    
    def _get_roe_level(self) -> str:
        """ROE水平评估"""
        if self.roe is None:
            return "unknown"
        if self.roe > 0.20:
            return "excellent"
        elif self.roe > 0.15:
            return "good"
        elif self.roe > 0.10:
            return "average"
        elif self.roe > 0:
            return "poor"
        else:
            return "loss"


class FundamentalFetcher:
    """基本面数据获取器"""
    
    def __init__(self):
        self._cache_ttl = 3600  # 1小时缓存
    
    def _get_cache_key(self, symbol: str) -> str:
        """生成缓存key"""
        return f"fundamental:{symbol}"
    
    def _get_from_cache(self, symbol: str) -> Optional[FundamentalData]:
        """从缓存获取"""
        if not REDIS_AVAILABLE or not redis_cache:
            return None
        
        try:
            cached = redis_cache.get(self._get_cache_key(symbol), prefix="")
            if cached:
                return FundamentalData(**cached)
        except Exception as e:
            logger.debug(f"读取缓存失败: {e}")
        
        return None
    
    def _save_to_cache(self, symbol: str, data: FundamentalData):
        """保存到缓存"""
        if not REDIS_AVAILABLE or not redis_cache:
            return
        
        try:
            redis_cache.set(
                self._get_cache_key(symbol),
                data.to_dict(),
                ttl=self._cache_ttl,
                prefix=""
            )
        except Exception as e:
            logger.debug(f"保存缓存失败: {e}")
    
    def get_fundamental_data(self, symbol: str, name: str = "") -> Optional[FundamentalData]:
        """
        获取股票基本面数据
        
        Args:
            symbol: 股票代码
            name: 股票名称
        
        Returns:
            FundamentalData对象或None
        """
        # 1. 尝试从缓存获取
        cached = self._get_from_cache(symbol)
        if cached:
            # 检查缓存是否过期（24小时）
            if datetime.now() - cached.updated_at < timedelta(hours=24):
                logger.debug(f"缓存命中: {symbol}")
                return cached
        
        # 2. 从数据源获取
        if not AKSHARE_AVAILABLE:
            logger.warning("akshare不可用，返回模拟数据")
            return self._get_mock_data(symbol, name)
        
        try:
            data = self._fetch_from_akshare(symbol, name)
            if data:
                self._save_to_cache(symbol, data)
            return data
        except Exception as e:
            logger.error(f"获取基本面数据失败 {symbol}: {e}")
            return self._get_mock_data(symbol, name)
    
    def _fetch_from_akshare(self, symbol: str, name: str) -> Optional[FundamentalData]:
        """从akshare获取数据"""
        try:
            # 获取个股信息
            stock_info = self._get_stock_info(symbol)
            
            # 获取财务指标
            financial = self._get_financial_indicators(symbol)
            
            # 获取估值指标
            valuation = self._get_valuation_indicators(symbol)
            
            # 合并数据
            return FundamentalData(
                symbol=symbol,
                name=name or stock_info.get("name", ""),
                pe_ttm=valuation.get("pe_ttm"),
                pe_lyr=valuation.get("pe_lyr"),
                pb=valuation.get("pb"),
                ps_ttm=valuation.get("ps_ttm"),
                roe=financial.get("roe"),
                roe_diluted=financial.get("roe_diluted"),
                roa=financial.get("roa"),
                gross_margin=financial.get("gross_margin"),
                net_margin=financial.get("net_margin"),
                revenue_growth=financial.get("revenue_growth"),
                profit_growth=financial.get("profit_growth"),
                debt_ratio=financial.get("debt_ratio"),
                total_market_cap=stock_info.get("total_market_cap"),
                float_market_cap=stock_info.get("float_market_cap"),
                industry=stock_info.get("industry")
            )
            
        except Exception as e:
            logger.error(f"akshare获取失败: {e}")
            return None
    
    def _get_stock_info(self, symbol: str) -> dict:
        """获取股票基本信息"""
        try:
            # 尝试获取A股列表
            df = ak.stock_zh_a_spot_em()
            stock_row = df[df["代码"] == symbol]
            
            if stock_row.empty:
                return {}
            
            row = stock_row.iloc[0]
            return {
                "name": row.get("名称", ""),
                "total_market_cap": float(row.get("总市值", 0)) if pd.notna(row.get("总市值")) else None,
                "float_market_cap": float(row.get("流通市值", 0)) if pd.notna(row.get("流通市值")) else None,
                "industry": row.get("行业", "")
            }
        except Exception as e:
            logger.debug(f"获取股票信息失败: {e}")
            return {}
    
    def _get_financial_indicators(self, symbol: str) -> dict:
        """获取财务指标"""
        try:
            # 获取主要财务指标
            df = ak.stock_financial_analysis_indicator(symbol=symbol)
            
            if df.empty:
                return {}
            
            # 获取最新一期数据
            latest = df.iloc[0]
            
            return {
                "roe": self._parse_percentage(latest.get("净资产收益率")),
                "roe_diluted": self._parse_percentage(latest.get("净资产收益率-摊薄")),
                "roa": self._parse_percentage(latest.get("总资产报酬率")),
                "gross_margin": self._parse_percentage(latest.get("销售毛利率")),
                "net_margin": self._parse_percentage(latest.get("销售净利率")),
                "revenue_growth": self._parse_percentage(latest.get("营业收入增长率")),
                "profit_growth": self._parse_percentage(latest.get("净利润增长率")),
                "debt_ratio": self._parse_percentage(latest.get("资产负债率"))
            }
        except Exception as e:
            logger.debug(f"获取财务指标失败: {e}")
            return {}
    
    def _get_valuation_indicators(self, symbol: str) -> dict:
        """获取估值指标"""
        try:
            # 获取估值指标
            df = ak.stock_value_em()
            stock_row = df[df["代码"] == symbol]
            
            if stock_row.empty:
                return {}
            
            row = stock_row.iloc[0]
            return {
                "pe_ttm": float(row.get("市盈率-TTM", 0)) if pd.notna(row.get("市盈率-TTM")) else None,
                "pe_lyr": float(row.get("市盈率-静态", 0)) if pd.notna(row.get("市盈率-静态")) else None,
                "pb": float(row.get("市净率", 0)) if pd.notna(row.get("市净率")) else None,
                "ps_ttm": float(row.get("市销率-TTM", 0)) if pd.notna(row.get("市销率-TTM")) else None
            }
        except Exception as e:
            logger.debug(f"获取估值指标失败: {e}")
            return {}
    
    def _parse_percentage(self, value) -> Optional[float]:
        """解析百分比值"""
        if pd.isna(value):
            return None
        
        try:
            if isinstance(value, str):
                # 移除百分号并转换
                value = value.replace("%", "").replace(",", "")
                return float(value) / 100
            return float(value) / 100 if float(value) > 1 else float(value)
        except:
            return None
    
    def _get_mock_data(self, symbol: str, name: str) -> FundamentalData:
        """生成模拟基本面数据"""
        import random
        
        # 根据symbol的hash生成固定的随机值
        random.seed(int(symbol.replace("0", "").replace("6", "").replace("3", "")) % 10000)
        
        return FundamentalData(
            symbol=symbol,
            name=name or f"股票{symbol}",
            pe_ttm=round(random.uniform(5, 80), 2),
            pb=round(random.uniform(0.5, 10), 2),
            roe=round(random.uniform(-0.1, 0.35), 4),
            roa=round(random.uniform(-0.05, 0.20), 4),
            gross_margin=round(random.uniform(0.05, 0.80), 4),
            net_margin=round(random.uniform(-0.1, 0.30), 4),
            revenue_growth=round(random.uniform(-0.3, 1.0), 4),
            profit_growth=round(random.uniform(-0.5, 2.0), 4),
            debt_ratio=round(random.uniform(0.1, 0.8), 4),
            total_market_cap=round(random.uniform(1e9, 1e12), 2),
            industry="其他"
        )
    
    def get_industry_fundamentals(self, industry: str) -> List[FundamentalData]:
        """
        获取行业基本面数据
        
        Args:
            industry: 行业名称
        
        Returns:
            该行业所有股票的基本面数据列表
        """
        results = []
        
        try:
            # 获取A股列表
            df = ak.stock_zh_a_spot_em()
            industry_stocks = df[df["行业"] == industry]
            
            for _, row in industry_stocks.head(50).iterrows():  # 限制数量
                symbol = row["代码"]
                name = row["名称"]
                data = self.get_fundamental_data(symbol, name)
                if data:
                    results.append(data)
                    
        except Exception as e:
            logger.error(f"获取行业数据失败: {e}")
        
        return results
    
    def get_market_fundamentals(self, limit: int = 100) -> List[FundamentalData]:
        """
        获取市场基本面数据
        
        Args:
            limit: 最多获取多少只股票
        
        Returns:
            市场股票基本面数据列表
        """
        results = []
        
        try:
            # 获取A股列表（按市值排序）
            df = ak.stock_zh_a_spot_em()
            df = df.sort_values("总市值", ascending=False)
            
            for _, row in df.head(limit).iterrows():
                symbol = row["代码"]
                name = row["名称"]
                data = self.get_fundamental_data(symbol, name)
                if data:
                    results.append(data)
                    
        except Exception as e:
            logger.error(f"获取市场数据失败: {e}")
        
        return results


# 全局基本面数据获取器实例
fundamental_fetcher = FundamentalFetcher()
