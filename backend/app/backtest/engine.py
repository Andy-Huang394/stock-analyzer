"""
回测引擎 - 增强版
参考 vnpy CtaBacktester 实现
"""
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

from app.strategies.indicators import SignalAnalyzer
from app.backtest.metrics import BacktestMetrics, MetricsCalculator, ReportGenerator


@dataclass
class Trade:
    """交易记录"""
    entry_date: datetime
    entry_price: float
    exit_date: Optional[datetime] = None
    exit_price: Optional[float] = None
    position: int = 1  # 1多头, -1空头
    pnl: float = 0.0
    return_pct: float = 0.0


class BacktestEngine:
    """回测引擎 - 支持多策略、多参数优化"""
    
    def __init__(self, initial_capital: float = 100000.0):
        self.initial_capital = initial_capital
        self.capital = initial_capital
        self.trades: List[Trade] = []
        self.equity_curve: List[Dict[str, Any]] = []
        self.position_history: List[Dict[str, Any]] = []
        
    def reset(self):
        """重置状态"""
        self.capital = self.initial_capital
        self.trades = []
        self.equity_curve = []
        self.position_history = []
    
    def run_backtest(self, df: pd.DataFrame, params: Dict[str, Any],
                     stop_loss_pct: float = 0.05,
                     take_profit_pct: float = 0.10,
                     trailing_stop: bool = False,
                     trailing_stop_pct: float = 0.03) -> Dict[str, Any]:
        """
        运行回测
        
        增强功能：
        - 综合评分买卖信号
        - 止损止盈（支持移动止损）
        - 仓位管理
        
        Args:
            df: 历史数据
            params: 策略参数
            stop_loss_pct: 止损比例
            take_profit_pct: 止盈比例
            trailing_stop: 是否启用移动止损
            trailing_stop_pct: 移动止损比例
        """
        self.reset()
        
        if len(df) < 30:
            return self._empty_result()
        
        analyzer = SignalAnalyzer(params)
        
        # 逐日回测
        position = 0
        entry_price = 0.0
        entry_date = None
        highest_price = 0.0  # 用于移动止损
        
        for i in range(20, len(df)):
            current_data = df.iloc[:i+1]
            current_row = df.iloc[i]
            date = current_row['date'] if 'date' in current_row else current_row.name
            price = current_row['close']
            
            # 获取信号和评分
            signals = analyzer.analyze(current_data)
            score, up_prob, trend = analyzer.calculate_score(signals)
            
            buy_threshold = params.get('buy_threshold', 70)
            sell_threshold = params.get('sell_threshold', 30)
            
            # 计算当前权益
            if position == 1:
                unrealized_pnl = (price - entry_price) / entry_price
                current_equity = self.capital * (1 + unrealized_pnl)
                highest_price = max(highest_price, price)
            else:
                current_equity = self.capital
                highest_price = 0
            
            self.equity_curve.append({
                'date': date,
                'equity': current_equity,
                'price': price,
                'score': score,
                'position': position
            })
            
            # 交易逻辑
            if position == 0:
                if score >= buy_threshold and trend == 'up':
                    position = 1
                    entry_price = price
                    entry_date = date
                    highest_price = price
                    
                    self.position_history.append({
                        'date': date,
                        'action': 'BUY',
                        'price': price,
                        'reason': f'Score {score:.1f} >= {buy_threshold}'
                    })
                    
            elif position == 1:
                return_pct = (price - entry_price) / entry_price
                exit_reason = None
                exit_price = price
                
                # 检查止损
                if return_pct <= -stop_loss_pct:
                    exit_reason = 'STOP_LOSS'
                
                # 检查止盈
                elif return_pct >= take_profit_pct:
                    exit_reason = 'TAKE_PROFIT'
                
                # 检查移动止损
                elif trailing_stop and highest_price > 0:
                    trailing_return = (price - highest_price) / highest_price
                    if trailing_return <= -trailing_stop_pct:
                        exit_reason = 'TRAILING_STOP'
                
                # 检查卖出信号
                elif score <= sell_threshold:
                    exit_reason = 'SIGNAL'
                
                if exit_reason:
                    self._close_trade(entry_date, entry_price, date, price, return_pct, exit_reason)
                    position = 0
                    entry_price = 0
                    highest_price = 0
        
        # 回测结束，平仓剩余持仓
        if position == 1 and entry_price > 0:
            last_row = df.iloc[-1]
            last_date = last_row['date'] if 'date' in last_row else last_row.name
            last_price = last_row['close']
            return_pct = (last_price - entry_price) / entry_price
            self._close_trade(entry_date, entry_price, last_date, last_price, return_pct, 'END_OF_TEST')
        
        # 使用新的指标计算系统
        metrics = MetricsCalculator.calculate_all_metrics(
            self.equity_curve, 
            self.trades, 
            self.initial_capital
        )
        
        return self._metrics_to_dict(metrics, params)
    
    def _close_trade(self, entry_date, entry_price, exit_date, exit_price, return_pct, reason=''):
        """记录交易"""
        pnl = self.capital * return_pct
        self.capital += pnl
        
        trade = Trade(
            entry_date=entry_date,
            entry_price=entry_price,
            exit_date=exit_date,
            exit_price=exit_price,
            pnl=pnl,
            return_pct=return_pct
        )
        self.trades.append(trade)
        
        self.position_history.append({
            'date': exit_date,
            'action': 'SELL',
            'price': exit_price,
            'reason': reason,
            'return_pct': return_pct * 100
        })
    
    def _metrics_to_dict(self, metrics: BacktestMetrics, params: Dict[str, Any]) -> Dict[str, Any]:
        """将指标对象转换为字典"""
        return {
            # 策略参数
            'params': params,
            
            # 收益指标
            'total_return': metrics.total_return,
            'annual_return': metrics.annual_return,
            'annual_volatility': metrics.annual_volatility,
            
            # 风险指标
            'max_drawdown': metrics.max_drawdown,
            'max_drawdown_duration': metrics.max_drawdown_duration,
            'calmar_ratio': metrics.calmar_ratio,
            'var_95': metrics.var_95,
            'cvar_95': metrics.cvar_95,
            
            # 风险调整收益
            'sharpe_ratio': metrics.sharpe_ratio,
            'sortino_ratio': metrics.sortino_ratio,
            'information_ratio': metrics.information_ratio,
            'alpha': metrics.alpha,
            'beta': metrics.beta,
            
            # 交易统计
            'trade_count': metrics.trade_count,
            'win_rate': metrics.win_rate,
            'profit_loss_ratio': metrics.profit_loss_ratio,
            'avg_trade_return': metrics.avg_trade_return,
            'avg_profit': metrics.avg_profit,
            'avg_loss': metrics.avg_loss,
            'max_consecutive_wins': metrics.max_consecutive_wins,
            'max_consecutive_losses': metrics.max_consecutive_losses,
            
            # 持仓分析
            'avg_trade_duration': metrics.avg_trade_duration,
            'avg_win_duration': metrics.avg_win_duration,
            'avg_loss_duration': metrics.avg_loss_duration,
            
            # 数据
            'equity_curve': metrics.equity_curve,
            'daily_returns': metrics.daily_returns,
            'monthly_returns': metrics.monthly_returns,
            'trades': self._trades_to_dict(),
            'position_history': self.position_history,
            'final_capital': self.capital,
            
            # 统计特征
            'skewness': metrics.skewness,
            'kurtosis': metrics.kurtosis
        }
    
    def _trades_to_dict(self) -> List[Dict[str, Any]]:
        """转换交易记录为字典"""
        return [
            {
                'entry_date': str(t.entry_date),
                'entry_price': t.entry_price,
                'exit_date': str(t.exit_date) if t.exit_date else None,
                'exit_price': t.exit_price,
                'return_pct': t.return_pct * 100,
                'pnl': t.pnl,
                'position': t.position
            }
            for t in self.trades
        ]
    
    def _empty_result(self) -> Dict[str, Any]:
        """空结果"""
        return {
            'params': {},
            'total_return': 0,
            'annual_return': 0,
            'annual_volatility': 0,
            'max_drawdown': 0,
            'max_drawdown_duration': 0,
            'calmar_ratio': 0,
            'sharpe_ratio': 0,
            'sortino_ratio': 0,
            'information_ratio': 0,
            'trade_count': 0,
            'win_rate': 0,
            'profit_loss_ratio': 0,
            'avg_trade_return': 0,
            'equity_curve': [],
            'daily_returns': [],
            'monthly_returns': {},
            'trades': [],
            'position_history': [],
            'final_capital': self.initial_capital,
            'alpha': 0,
            'beta': 1,
            'skewness': 0,
            'kurtosis': 0,
            'var_95': 0,
            'cvar_95': 0
        }
    
    def optimize_parameters(self, df: pd.DataFrame, 
                          param_grid: List[Dict[str, Any]],
                          objective: str = 'sharpe') -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        参数优化
        
        Args:
            df: 历史数据
            param_grid: 参数网格
            objective: 优化目标 ('sharpe', 'return', 'calmar', 'composite')
        """
        results = []
        
        for params in param_grid:
            result = self.run_backtest(df, params)
            results.append(result)
        
        # 根据目标函数排序
        def score_func(r):
            if objective == 'sharpe':
                return r['sharpe_ratio']
            elif objective == 'return':
                return r['total_return']
            elif objective == 'calmar':
                return r['calmar_ratio']
            elif objective == 'composite':
                # 综合评分
                return (
                    r['total_return'] * 0.3 +
                    r['sharpe_ratio'] * 15 * 0.3 +
                    r['calmar_ratio'] * 10 * 0.2 +
                    r['win_rate'] * 0.2
                )
            else:
                return r['sharpe_ratio']
        
        results.sort(key=score_func, reverse=True)
        
        return results[0] if results else None, results
    
    def generate_report(self, result: Dict[str, Any]) -> str:
        """生成文字报告"""
        # 转换为BacktestMetrics对象
        metrics = BacktestMetrics(
            total_return=result.get('total_return', 0),
            annual_return=result.get('annual_return', 0),
            annual_volatility=result.get('annual_volatility', 0),
            max_drawdown=result.get('max_drawdown', 0),
            max_drawdown_duration=result.get('max_drawdown_duration', 0),
            calmar_ratio=result.get('calmar_ratio', 0),
            sharpe_ratio=result.get('sharpe_ratio', 0),
            sortino_ratio=result.get('sortino_ratio', 0),
            information_ratio=result.get('information_ratio', 0),
            trade_count=result.get('trade_count', 0),
            win_rate=result.get('win_rate', 0),
            profit_loss_ratio=result.get('profit_loss_ratio', 0),
            avg_trade_return=result.get('avg_trade_return', 0),
            avg_profit=result.get('avg_profit', 0),
            avg_loss=result.get('avg_loss', 0),
            max_consecutive_wins=result.get('max_consecutive_wins', 0),
            max_consecutive_losses=result.get('max_consecutive_losses', 0),
            avg_trade_duration=result.get('avg_trade_duration', 0),
            avg_win_duration=result.get('avg_win_duration', 0),
            avg_loss_duration=result.get('avg_loss_duration', 0),
            equity_curve=result.get('equity_curve', []),
            daily_returns=result.get('daily_returns', []),
            monthly_returns=result.get('monthly_returns', {}),
            alpha=result.get('alpha', 0),
            beta=result.get('beta', 1),
            skewness=result.get('skewness', 0),
            kurtosis=result.get('kurtosis', 0),
            var_95=result.get('var_95', 0),
            cvar_95=result.get('cvar_95', 0)
        )
        
        return ReportGenerator.generate_summary(metrics)
    
    def get_monthly_heatmap_data(self, result: Dict[str, Any]) -> List[List[Any]]:
        """获取月度收益热力图数据"""
        monthly_returns = result.get('monthly_returns', {})
        return ReportGenerator.generate_monthly_heatmap_data(monthly_returns)
