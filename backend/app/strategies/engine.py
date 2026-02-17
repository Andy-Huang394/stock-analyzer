"""
策略引擎 - 管理策略参数和优化
"""
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import json
import numpy as np
from datetime import datetime

from app.models.schemas import StrategyParams, AnalysisResult
from app.strategies.indicators import SignalAnalyzer


@dataclass
class ParameterRange:
    """参数范围"""
    min_value: float
    max_value: float
    step: float


class StrategyEngine:
    """策略引擎"""
    
    def __init__(self, params: Optional[StrategyParams] = None):
        self.params = params or StrategyParams()
        self.analyzer = SignalAnalyzer(self.params.model_dump())
        self._param_history: List[Dict[str, Any]] = []
    
    def update_params(self, params: StrategyParams):
        """更新策略参数"""
        self.params = params
        self.analyzer = SignalAnalyzer(params.model_dump())
        
        # 记录参数变更
        self._param_history.append({
            'timestamp': datetime.now().isoformat(),
            'params': params.model_dump()
        })
    
    def get_optimal_params(self, backtest_results: List[Dict[str, Any]]) -> StrategyParams:
        """
        根据回测结果选择最优参数
        
        综合考虑：收益率、夏普比率、最大回撤、胜率
        """
        if not backtest_results:
            return self.params
        
        # 计算综合得分
        best_result = None
        best_score = -np.inf
        
        for result in backtest_results:
            # 综合评分公式
            score = (
                result['total_return'] * 0.4 +  # 收益率权重40%
                result['sharpe_ratio'] * 10 * 0.3 +  # 夏普比率权重30%
                (1 - abs(result['max_drawdown'])) * 100 * 0.2 +  # 回撤控制权重20%
                result['win_rate'] * 100 * 0.1  # 胜率权重10%
            )
            
            if score > best_score:
                best_score = score
                best_result = result
        
        if best_result and 'params' in best_result:
            return StrategyParams(**best_result['params'])
        
        return self.params
    
    def generate_param_combinations(self, n_combinations: int = 20) -> List[StrategyParams]:
        """
        生成参数组合用于网格搜索优化
        """
        combinations = []
        
        # 定义参数搜索范围
        ranges = {
            'rsi_period': [10, 14, 21],
            'rsi_overbought': [65, 70, 75, 80],
            'rsi_oversold': [20, 25, 30, 35],
            'macd_fast': [8, 12, 15],
            'macd_slow': [21, 26, 30],
            'ma_short': [5, 10],
            'ma_medium': [15, 20, 30],
        }
        
        # 随机采样
        np.random.seed(42)
        for _ in range(n_combinations):
            params = StrategyParams(
                rsi_period=np.random.choice(ranges['rsi_period']),
                rsi_overbought=np.random.choice(ranges['rsi_overbought']),
                rsi_oversold=np.random.choice(ranges['rsi_oversold']),
                macd_fast=np.random.choice(ranges['macd_fast']),
                macd_slow=np.random.choice(ranges['macd_slow']),
                ma_short=np.random.choice(ranges['ma_short']),
                ma_medium=np.random.choice(ranges['ma_medium']),
            )
            combinations.append(params)
        
        return combinations
    
    def analyze_stock(self, df, symbol: str, name: str) -> Optional[AnalysisResult]:
        """
        分析单只股票
        """
        try:
            # 获取信号
            signals = self.analyzer.analyze(df)
            
            if not signals:
                return None
            
            # 计算评分
            score, up_prob, trend = self.analyzer.calculate_score(signals)
            
            # 计算多时间维度预测
            predictions = self.analyzer.calculate_multi_timeframe_prediction(df, signals)
            
            latest = df.iloc[-1]
            
            # 构建结果
            from app.models.schemas import TechnicalSignal, TrendDirection
            
            signal_list = []
            for name_sig, sig in signals.items():
                weight = getattr(self.params, f'{name_sig.lower()}_weight', 0.2)
                signal_list.append(TechnicalSignal(
                    name=name_sig,
                    value=sig.value,
                    signal=sig.signal,
                    weight=weight,
                    description=sig.description
                ))
            
            return AnalysisResult(
                symbol=symbol,
                name=name,
                price=float(latest['close']),
                change_percent=float(latest.get('change_percent', 0)),
                total_score=score,
                trend_direction=TrendDirection(trend),
                confidence=up_prob if trend == 'up' else (1 - up_prob),
                signals=signal_list,
                up_probability=up_prob,
                up_probability_1d=predictions['up_prob_1d'],
                up_probability_7d=predictions['up_prob_7d'],
                expected_return=None,
                expected_return_1d=predictions['exp_return_1d'],
                expected_return_7d=predictions['exp_return_7d'],
                confidence_1d=predictions['conf_1d'],
                confidence_7d=predictions['conf_7d'],
                timestamp=datetime.now()
            )
            
        except Exception as e:
            print(f"分析股票 {symbol} 失败: {e}")
            return None
    
    def rank_stocks(self, results: List[AnalysisResult], 
                   sort_by: str = 'score') -> List[AnalysisResult]:
        """
        对分析结果进行排序
        
        Args:
            results: 分析结果列表
            sort_by: 排序方式 ('score', 'change', 'probability')
        """
        if not results:
            return []
        
        if sort_by == 'score':
            # 按综合评分排序（主要）+ 涨幅（次要）
            sorted_results = sorted(
                results,
                key=lambda x: (x.total_score, x.change_percent),
                reverse=True
            )
        elif sort_by == 'probability':
            # 按上涨概率排序
            sorted_results = sorted(
                results,
                key=lambda x: x.up_probability,
                reverse=True
            )
        elif sort_by == 'change':
            # 按涨幅排序
            sorted_results = sorted(
                results,
                key=lambda x: x.change_percent,
                reverse=True
            )
        else:
            sorted_results = results
        
        # 添加排名
        for i, result in enumerate(sorted_results):
            result.rank = i + 1
        
        return sorted_results
    
    def filter_stocks(self, results: List[AnalysisResult],
                     min_score: float = 50,
                     min_probability: float = 0.5,
                     trend_only: Optional[str] = None) -> List[AnalysisResult]:
        """
        过滤股票
        
        Args:
            min_score: 最低综合评分
            min_probability: 最低上涨概率
            trend_only: 只保留指定趋势 ('up', 'down', 'neutral')
        """
        filtered = results
        
        filtered = [r for r in filtered if r.total_score >= min_score]
        filtered = [r for r in filtered if r.up_probability >= min_probability]
        
        if trend_only:
            filtered = [r for r in filtered if r.trend_direction.value == trend_only]
        
        return filtered
    
    def get_strategy_summary(self) -> Dict[str, Any]:
        """获取策略摘要"""
        return {
            'current_params': self.params.model_dump(),
            'param_history_count': len(self._param_history),
            'last_updated': self._param_history[-1]['timestamp'] if self._param_history else None
        }
