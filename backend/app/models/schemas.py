"""
数据模型定义
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class TrendDirection(str, Enum):
    """趋势方向"""
    UP = "up"
    DOWN = "down"
    NEUTRAL = "neutral"


class StockInfo(BaseModel):
    """股票基本信息"""
    symbol: str = Field(..., description="股票代码")
    name: str = Field(..., description="股票名称")
    industry: Optional[str] = Field(None, description="所属行业")
    market: Optional[str] = Field(None, description="市场(沪/深/北)")


class StockRealtime(BaseModel):
    """股票实时数据"""
    symbol: str
    name: str
    price: float
    change_percent: float
    change_amount: float
    volume: int
    amount: float
    high: float
    low: float
    open: float
    pre_close: float
    turnover: Optional[float] = None
    timestamp: datetime


class TechnicalSignal(BaseModel):
    """技术信号"""
    name: str
    value: float
    signal: int  # -1, 0, 1 分别代表卖出、中性、买入
    weight: float
    description: str


class FundamentalMetrics(BaseModel):
    """基本面指标"""
    pe_ttm: Optional[float] = Field(None, description="市盈率TTM")
    pe_lyr: Optional[float] = Field(None, description="市盈率静态")
    pb: Optional[float] = Field(None, description="市净率")
    ps_ttm: Optional[float] = Field(None, description="市销率TTM")
    roe: Optional[float] = Field(None, description="净资产收益率(%)")
    roa: Optional[float] = Field(None, description="总资产收益率(%)")
    gross_margin: Optional[float] = Field(None, description="毛利率(%)")
    net_margin: Optional[float] = Field(None, description="净利率(%)")
    revenue_growth: Optional[float] = Field(None, description="营收增长率(%)")
    profit_growth: Optional[float] = Field(None, description="净利润增长率(%)")
    debt_ratio: Optional[float] = Field(None, description="资产负债率(%)")


class FundamentalScores(BaseModel):
    """基本面评分"""
    total_score: float = Field(..., ge=0, le=100, description="综合基本面评分")
    value_score: float = Field(..., ge=0, le=100, description="价值因子评分")
    quality_score: float = Field(..., ge=0, le=100, description="质量因子评分")
    growth_score: float = Field(..., ge=0, le=100, description="成长因子评分")
    pe_level: str = Field(..., description="PE估值水平")
    pb_level: str = Field(..., description="PB估值水平")
    roe_level: str = Field(..., description="ROE盈利水平")


class AnalysisResult(BaseModel):
    """分析结果 - 支持多因子分析"""
    symbol: str
    name: str
    price: float
    change_percent: float
    
    # 评分
    total_score: float = Field(..., ge=0, le=100, description="综合评分0-100")
    trend_direction: TrendDirection
    confidence: float = Field(..., ge=0, le=1, description="置信度")
    
    # 技术信号详情
    signals: List[TechnicalSignal]
    
    # 预估涨幅概率 - 多时间维度
    up_probability: float = Field(..., ge=0, le=1, description="即时上涨概率")
    up_probability_1d: float = Field(default=0.5, ge=0, le=1, description="明日上涨概率")
    up_probability_7d: float = Field(default=0.5, ge=0, le=1, description="未来一周上涨概率")
    
    # 预期收益率
    expected_return: Optional[float] = None
    expected_return_1d: Optional[float] = None
    expected_return_7d: Optional[float] = None
    
    # 预测置信度
    confidence_1d: float = Field(default=0.5, ge=0, le=1)
    confidence_7d: float = Field(default=0.5, ge=0, le=1)
    
    # 基本面数据（多因子分析用）
    fundamentals: Optional[FundamentalMetrics] = None
    fundamental_scores: Optional[FundamentalScores] = None
    combined_score: Optional[float] = Field(None, ge=0, le=100, description="技术面+基本面综合评分")
    
    # 排名
    rank: Optional[int] = None
    
    timestamp: datetime


class StrategyParams(BaseModel):
    """策略参数"""
    # RSI参数
    rsi_period: int = Field(default=14, ge=5, le=30)
    rsi_overbought: float = Field(default=70, ge=60, le=90)
    rsi_oversold: float = Field(default=30, ge=10, le=40)
    
    # MACD参数
    macd_fast: int = Field(default=12, ge=5, le=20)
    macd_slow: int = Field(default=26, ge=15, le=40)
    macd_signal: int = Field(default=9, ge=5, le=15)
    
    # 均线参数
    ma_short: int = Field(default=5, ge=3, le=20)
    ma_medium: int = Field(default=20, ge=10, le=60)
    ma_long: int = Field(default=60, ge=30, le=120)
    
    # 权重配置
    rsi_weight: float = Field(default=0.25, ge=0, le=1)
    macd_weight: float = Field(default=0.30, ge=0, le=1)
    ma_weight: float = Field(default=0.25, ge=0, le=1)
    volume_weight: float = Field(default=0.20, ge=0, le=1)
    
    # 多因子权重
    technical_weight: float = Field(default=0.60, ge=0, le=1, description="技术面权重")
    fundamental_weight: float = Field(default=0.40, ge=0, le=1, description="基本面权重")
    
    # 评分阈值
    buy_threshold: float = Field(default=70, ge=50, le=90)
    sell_threshold: float = Field(default=30, ge=10, le=50)


class BacktestResult(BaseModel):
    """回测结果"""
    strategy_params: StrategyParams
    total_return: float
    annual_return: float
    max_drawdown: float
    sharpe_ratio: float
    win_rate: float
    trade_count: int
    profit_trades: int
    loss_trades: int
    
    # 每日收益曲线
    equity_curve: List[Dict[str, Any]]
    
    # 交易记录
    trades: List[Dict[str, Any]]


class MarketOverview(BaseModel):
    """市场概览"""
    timestamp: datetime
    total_stocks: int
    up_count: int
    down_count: int
    flat_count: int
    avg_change: float
    volume: float
    top_gainers: List[AnalysisResult]
    top_losers: List[AnalysisResult]
    hot_sectors: List[Dict[str, Any]]
